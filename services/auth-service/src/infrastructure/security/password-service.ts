import argon2 from "argon2";

export class PasswordService {
  async hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
    });
  }

  async verify(
    password: string,
    passwordHash: string,
  ): Promise<boolean> {
    return argon2.verify(passwordHash, password);
  }
}