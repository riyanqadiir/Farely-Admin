import mongoose from 'mongoose';

let initialized = false;

/** First path segment after host in a Mongo URI, if present (e.g. .../Farely → Farely). */
export function parseDbNameFromMongoUri(uri: string): string | null {
  if (!uri || typeof uri !== 'string') return null;
  const match = uri.match(/mongodb(?:\+srv)?:\/\/[^/]+\/([^/?]+)/);
  if (!match?.[1]) return null;
  const name = decodeURIComponent(match[1].trim());
  return name.length > 0 ? name : null;
}

export const getAdminDbName = (): string => process.env.ADMIN_DB_NAME || 'admin_db';

/** App DB where Farely writes (e.g. `feedbacks`, `eventoutboxes`). Prefer explicit APP_DB_NAME; else name from MONGO_URI path; else default. */
export const getAppDbName = (): string =>
  process.env.APP_DB_NAME || parseDbNameFromMongoUri(process.env.MONGO_URI || '') || 'Farely';

export const connectMongo = async (): Promise<void> => {
  if (initialized && mongoose.connection.readyState === 1) return;

  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
  await mongoose.connect(uri);
  initialized = true;
};

export const adminConn = (): mongoose.Connection => mongoose.connection.useDb(getAdminDbName(), { useCache: true });
export const appConn = (): mongoose.Connection => mongoose.connection.useDb(getAppDbName(), { useCache: true });
