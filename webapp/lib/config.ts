// Configuration for backend URLs based on environment
export const getBackendConfig = () => {
  // Check if we're in a Workers/production environment
  const isProduction = process.env.NODE_ENV === 'production' || 
                      (typeof window !== 'undefined' && window.location.hostname !== 'localhost');
  
  if (isProduction) {
    // Production: use the Workers backend URL
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://openai-twilio-realtime-worker.hall-russets0w.workers.dev';
    return {
      httpUrl: backendUrl,
      wsUrl: backendUrl.replace('https://', 'wss://').replace('http://', 'ws://'),
    };
  }
  
  // Development: use localhost (but respect environment variable if set)
  const devBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.startsWith('https://') 
    ? process.env.NEXT_PUBLIC_BACKEND_URL  // Use production URL if set
    : 'http://localhost:8787';             // Default to localhost for dev
    
  return {
    httpUrl: devBackendUrl,
    wsUrl: devBackendUrl.replace('http://', 'ws://').replace('https://', 'wss://'),
  };
};

// Export functions that calculate URLs at runtime
export const getBackendHttpUrl = () => getBackendConfig().httpUrl;
export const getBackendWsUrl = () => getBackendConfig().wsUrl;

// For backward compatibility, but these will be calculated at module load
export const { httpUrl: BACKEND_HTTP_URL, wsUrl: BACKEND_WS_URL } = getBackendConfig(); 