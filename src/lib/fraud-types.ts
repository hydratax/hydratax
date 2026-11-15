export type ClientFraudMetadata = {
  browserJsUserAgent: string;
  timezone: string;
  screens: string;
  windowSize: string;
  localIps: string;
  localIpsTimestamp: string;
  deviceId: string;
  /** true/false — browser Do Not Track */
  doNotTrack: string;
  /** Percent-encoded plugin list, or empty when unavailable */
  browserPlugins: string;
  /** key=value pairs e.g. hydratax=<userId> */
  userIds: string;
  /** MFA details when available; empty string if password-only */
  multiFactor: string;
};
