export interface ForgeMindAppOptions {
  /**
   * Unique name of the service using the ForgeMind SDK.
   *
   * Examples:
   * - api-gateway
   * - auth-service
   * - repository-service
   */
  serviceName: string;

  /**
   * Whether to enable request logging.
   *
   * Defaults to true.
   */
  requestLogging?: boolean;

  /**
   * Whether to enable CORS middleware.
   *
   * Defaults to true.
   */
  cors?: boolean;

  /**
   * Whether to enable Helmet security headers.
   *
   * Defaults to true.
   */
  security?: boolean;

  /**
   * Whether to enable response compression.
   *
   * Defaults to true.
   */
  compression?: boolean;

  /**
   * API prefix used by the service.
   *
   * Defaults to the configured API_PREFIX.
   */
  apiPrefix?: string;
}