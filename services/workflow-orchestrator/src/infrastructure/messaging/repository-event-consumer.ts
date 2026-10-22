
import type { Consumer, Producer } from "kafkajs";
import { decodeRepositoryEvent } from "../../application/repository-event-decoder.js";
import { RepositoryEventProcessor } from "../../application/repository-event-processor.js";

interface RepositoryEventConsumerOptions {
  readonly topic?: string;
  readonly deadLetterTopic?: string;
}

export class RepositoryEventConsumer {
  private readonly topic: string;
  private readonly deadLetterTopic: string;

  constructor(
    private readonly consumer: Consumer,
    private readonly producer: Producer,
    private readonly processor: RepositoryEventProcessor,
    options: RepositoryEventConsumerOptions = {},
  ) {
    this.topic = options.topic ?? "repository.events";
    this.deadLetterTopic =
      options.deadLetterTopic ?? "repository.events.dlq";
  }

  async start(): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: this.topic,
      fromBeginning: false,
    });

    await this.consumer.run({
      autoCommit: false,
      eachMessage: async ({ topic, partition, message }) => {
        const rawValue = message.value?.toString("utf8");

        if (rawValue === undefined) {
          await this.deadLetterAndCommit({
            topic,
            partition,
            offset: message.offset,
            rawValue: null,
            reason: "Message value is empty.",
          });
          return;
        }

        let event: ReturnType<typeof decodeRepositoryEvent>;

        try {
          event = decodeRepositoryEvent(rawValue);
        } catch (error) {
          await this.deadLetterAndCommit({
            topic,
            partition,
            offset: message.offset,
            rawValue,
            reason:
              error instanceof Error ? error.message : String(error),
          });
          return;
        }

        // This is an outbound event owned by the parser service.
        // Do not feed it back into the workflow processor.
        if (event.eventType === "RepositoryParseRequested") {
          await this.commit(topic, partition, message.offset);
          return;
        }

        // If processing fails, this throws and the offset remains
        // uncommitted. Inbox deduplication handles redelivery.
        await this.processor.process(event);

        await this.commit(topic, partition, message.offset);
      },
    });
  }

  async stop(): Promise<void> {
    await this.consumer.disconnect();
  }

  private async deadLetterAndCommit(input: {
    readonly topic: string;
    readonly partition: number;
    readonly offset: string;
    readonly rawValue: string | null;
    readonly reason: string;
  }): Promise<void> {
    await this.producer.send({
      topic: this.deadLetterTopic,
      messages: [
        {
          key: `${input.topic}:${input.partition}:${input.offset}`,
          value: JSON.stringify({
            sourceTopic: input.topic,
            sourcePartition: input.partition,
            sourceOffset: input.offset,
            rawValue: input.rawValue,
            failure: input.reason,
            deadLetteredAt: new Date().toISOString(),
            source: "workflow-consumer",
          }),
        },
      ],
    });

    await this.commit(
      input.topic,
      input.partition,
      input.offset,
    );
  }

  private async commit(
    topic: string,
    partition: number,
    offset: string,
  ): Promise<void> {
    await this.consumer.commitOffsets([
      {
        topic,
        partition,
        offset: (BigInt(offset) + 1n).toString(),
      },
    ]);
  }
}
