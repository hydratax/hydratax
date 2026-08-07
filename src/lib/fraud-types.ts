export type ClientFraudMetadata = {
  browserJsUserAgent: string;
  timezone: string;
  screens: string;
  windowSize: string;
  localIps: string;
  localIpsTimestamp: string;
  deviceId?: string;
};
