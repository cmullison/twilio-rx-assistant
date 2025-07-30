export interface Session {
  twilioConnId?: string;
  frontendConnId?: string;
  modelConnId?: string;
  config?: any;
  streamSid?: string;
  callSid?: string;
  lastAssistantItem?: string;
  responseStartTimestamp?: number;
  latestMediaTimestamp?: number;
  openAIApiKey?: string;
  createdAt?: number;        // Timestamp when session was created
  lastActivity?: number;     // Timestamp of last activity for auto-cleanup
  sessionId?: string;        // The unique session identifier used for routing
  assignedTo?: string;       // Session ID that claimed this call
  assignedAt?: number;       // Timestamp when call was assigned
  callerNumber?: string;     // Full phone number of the caller
  callerTimestamp?: number;  // Timestamp when caller number was stored
  broadcastMessages?: Array<{
    messageId: string;
    message: any;
    timestamp: number;
    delivered: boolean;
  }>;                        // Pending broadcast messages
}

export interface FunctionCallItem {
  name: string;
  arguments: string;
  call_id?: string;
}

export interface FunctionSchema {
  name: string;
  type: "function";
  description?: string;
  parameters: any;
}

export interface FunctionHandler {
  schema: FunctionSchema;
  handler: (args: any) => Promise<string>;
}

// Cloudflare Workers types - simplified definitions
interface DurableObjectNamespace {
  idFromName(name: string): any;
  get(id: any): any;
}

export interface WorkerEnv {
  SESSION_MANAGER: DurableObjectNamespace;
  OPENAI_API_KEY: string;
  PUBLIC_URL: string;
  TRACKS: R2Bucket;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  // AI Gateway configuration
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_GATEWAY_ID: string;
  CLOUDFLARE_API_KEY: string;
  CLOUDFLARE_GATEWAY_URL: string;
  headers: Record<string, string>;
}

// R2 types
interface R2Bucket {
  get(key: string): Promise<R2Object | null>;
  put(key: string, value: ReadableStream | ArrayBuffer | string): Promise<void>;
  list(options?: any): Promise<any>;
}

interface R2Object {
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
}

export interface WebSocketMessage {
  type: string;
  [key: string]: any;
} 