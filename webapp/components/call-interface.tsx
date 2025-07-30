"use client";

import React, { useState, useEffect } from "react";
import TopBar from "@/components/top-bar";
import ChecklistAndConfig from "@/components/checklist-and-config";
import SessionConfigurationPanel from "@/components/session-configuration-panel";
import Transcript from "@/components/transcript";
import FunctionCallsPanel from "@/components/function-calls-panel";
import IncomingCallToast from "@/components/incoming-call-toast";
import { Item } from "@/components/types";
import handleRealtimeEvent from "@/lib/handle-realtime-event";
import PhoneNumberChecklist from "@/components/phone-number-checklist";
import { getBackendWsUrl, getBackendHttpUrl } from "@/lib/config";

interface IncomingCall {
  callSid: string;
  partialNumber: string;
  timestamp: number;
}

const CallInterface = () => {
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState("");
  const [allConfigsReady, setAllConfigsReady] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [callStatus, setCallStatus] = useState("disconnected");
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [lastMessageId, setLastMessageId] = useState<string | null>(null);
  const [sessionId] = useState(() => {
    // Generate a unique session ID for this browser session
    return `frontend-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 9)}`;
  });

  const checkForBroadcastMessages = async () => {
    try {
      const url = new URL(`${getBackendHttpUrl()}/broadcast-registry/get-broadcasts`);
      if (lastMessageId) {
        url.searchParams.set('lastMessageId', lastMessageId);
      }
      
      const response = await fetch(url.toString());
      
      if (response.ok) {
        const messages = (await response.json()) as Array<{
          messageId: string;
          message: any;
          timestamp: number;
        }>;
        
        if (messages.length > 0) {
          // Update lastMessageId to the newest message
          const newestMessage = messages[messages.length - 1];
          setLastMessageId(newestMessage.messageId);
        }
        
        for (const msgData of messages) {
          const { message } = msgData;

          // Handle incoming call notifications
          if (message.type === "incoming_call") {
            setIncomingCall({
              callSid: message.callSid,
              partialNumber: message.partialNumber,
              timestamp: message.timestamp,
            });
          } else if (message.type === "call_claimed") {
            // Hide the toast when ANY session claims this call
            if (incomingCall?.callSid === message.callSid) {
              setIncomingCall(null);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error checking for broadcast messages:", error);
    }
  };

  // Poll for broadcast messages (incoming calls, etc.)
  useEffect(() => {
    if (!allConfigsReady) return;

    const pollInterval = setInterval(checkForBroadcastMessages, 1000);
    
    // Initial check
    checkForBroadcastMessages();
    
    return () => clearInterval(pollInterval);
  }, [allConfigsReady, lastMessageId]);

  useEffect(() => {
    if (allConfigsReady && !ws) {
      // Check if there's a callSid in the URL (user refreshed during a call)
      const urlParams = new URLSearchParams(window.location.search);
      const existingCallSid = urlParams.get("callSid");

      if (existingCallSid) {
        console.log(
          "Found existing callSid in URL, connecting to logs for in-progress call:",
          existingCallSid
        );
        // Connect to logs WebSocket (not call WebSocket) and set status to in-call
        // The transcript will come through the logs broadcast system
        setCallStatus("in-call");
      }

      const wsUrl = `${getBackendWsUrl()}/logs?sessionId=${encodeURIComponent(
        sessionId
      )}`;
      const newWs = new WebSocket(wsUrl);

      newWs.onopen = () => {
        console.log("Connected to logs websocket with session:", sessionId);
        setCallStatus("connected");

        // Original approach - handle broadcasts via WebSocket messages
      };

      newWs.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log("Received logs event:", data);

        // Handle incoming call notifications
        if (data.type === "incoming_call") {
          setIncomingCall({
            callSid: data.callSid,
            partialNumber: data.partialNumber,
            timestamp: data.timestamp,
          });
        } else if (data.type === "call_claimed") {
          // Hide the toast if this call was claimed by someone else
          if (
            incomingCall?.callSid === data.callSid &&
            data.claimedBy !== sessionId
          ) {
            setIncomingCall(null);
          }
        } else {
          // Handle regular realtime events
          handleRealtimeEvent(data, setItems);
        }
      };

      newWs.onclose = () => {
        console.log("Logs websocket disconnected");
        setWs(null);
        setCallStatus("disconnected");
      };

      setWs(newWs);
    }
  }, [allConfigsReady, ws]);

  const handleAcceptCall = () => {
    console.log("User clicked Accept on incoming call");
  };

  const handleIgnoreCall = () => {
    console.log("User clicked Ignore on incoming call");
    setIncomingCall(null);
  };

  const handleCloseToast = () => {
    setIncomingCall(null);
  };

  const handleCallClaimed = (callSid: string, claimedSessionId: string) => {
    console.log("Call claimed, updating URL for persistence:", {
      callSid,
      claimedSessionId,
    });

    // Update browser URL to include callSid for refresh persistence
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set("callSid", callSid);
    window.history.pushState({}, "", newUrl.toString());
    console.log("Updated browser URL with callSid:", newUrl.toString());

    // Keep existing logs WebSocket - don't switch to call WebSocket!
    // The frontend should stay on logs to receive transcript events
    // Only Twilio should connect to the /call WebSocket
    setCallStatus("in-call");
  };

  return (
    <div className="h-screen bg-white flex flex-col relative">
      <ChecklistAndConfig
        ready={allConfigsReady}
        setReady={setAllConfigsReady}
        selectedPhoneNumber={selectedPhoneNumber}
        setSelectedPhoneNumber={setSelectedPhoneNumber}
      />
      <TopBar />
      <div className="flex-grow p-4 h-full overflow-hidden flex flex-col">
        <div className="grid grid-cols-12 gap-4 h-full">
          {/* Left Column */}
          <div className="col-span-3 flex flex-col h-full overflow-hidden">
            <SessionConfigurationPanel
              callStatus={callStatus}
              ws={ws}
              onSave={(config) => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                  const updateEvent = {
                    type: "session.update",
                    session: {
                      ...config,
                    },
                  };
                  console.log("Sending update event:", updateEvent);
                  ws.send(JSON.stringify(updateEvent));
                }
              }}
            />
          </div>

          {/* Middle Column: Transcript */}
          <div className="col-span-6 flex flex-col gap-4 h-full overflow-hidden">
            <PhoneNumberChecklist
              selectedPhoneNumber={selectedPhoneNumber}
              allConfigsReady={allConfigsReady}
              setAllConfigsReady={setAllConfigsReady}
            />
            <Transcript items={items} />
          </div>

          {/* Right Column: Function Calls */}
          <div className="col-span-3 flex flex-col h-full overflow-hidden">
            <FunctionCallsPanel items={items} ws={ws} />
          </div>
        </div>
      </div>

      {/* Incoming Call Toast */}
      {incomingCall && (
        <IncomingCallToast
          callSid={incomingCall.callSid}
          partialNumber={incomingCall.partialNumber}
          sessionId={sessionId}
          onAccept={handleAcceptCall}
          onIgnore={handleIgnoreCall}
          onClose={handleCloseToast}
          onCallClaimed={handleCallClaimed}
        />
      )}
    </div>
  );
};

export default CallInterface;
