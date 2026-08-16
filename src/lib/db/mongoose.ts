import mongoose, { type Mongoose } from "mongoose";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("Missing MONGODB_URI environment variable");
}

// Cached on the global object so hot reloads in dev reuse the same
// connection instead of opening a new one on every module re-evaluation.
interface MongooseCache {
  conn: Mongoose | null;
  promise: Promise<Mongoose> | null;
}

declare global {
  var _mongooseCache: MongooseCache | undefined;
}

const cache: MongooseCache = global._mongooseCache ?? { conn: null, promise: null };
global._mongooseCache = cache;

export default async function dbConnect(): Promise<Mongoose> {
  if (cache.conn) {
    return cache.conn;
  }

  if (!cache.promise) {
    cache.promise = mongoose.connect(uri, {
      dbName: process.env.MONGODB_DB_NAME,
    });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}
