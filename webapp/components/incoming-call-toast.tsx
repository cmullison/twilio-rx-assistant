"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBackendHttpUrl } from "@/lib/config";

interface IncomingCallToastProps {
  callSid: string;
  partialNumber: string;
  sessionId: string;
  onAccept: () => void;
  onIgnore: () => void;
  onClose: () => void;
  onCallClaimed: (callSid: string, sessionId: string) => void;
}

export const IncomingCallToast: React.FC<IncomingCallToastProps> = ({
  callSid,
  partialNumber,
  sessionId,
  onAccept,
  onIgnore,
  onClose,
  onCallClaimed,
}) => {
  const [showVerification, setShowVerification] = useState(false);
  const [lastFourDigits, setLastFourDigits] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState("");

  const handleAccept = () => {
    setShowVerification(true);
    onAccept();
  };

  const handleIgnore = () => {
    onIgnore();
    onClose();
  };

  const handleVerificationSubmit = async () => {
    if (!/^\d{4}$/.test(lastFourDigits)) {
      setVerificationError("Please enter exactly 4 digits");
      return;
    }

    setIsVerifying(true);
    setVerificationError("");

    try {
      const response = await fetch(`${getBackendHttpUrl()}/claim-call`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          callSid,
          lastFourDigits,
          sessionId,
        }),
      });

      const result = (await response.json()) as {
        success: boolean;
        message?: string;
        connectUrl?: string;
      };

      if (result.success) {
        // Success! Call has been claimed
        console.log("Call claimed successfully:", result);

        // Notify parent component to connect to call WebSocket
        onCallClaimed(callSid, sessionId);
        onClose();
      } else {
        setVerificationError(result.message || "Verification failed");
      }
    } catch (error) {
      console.error("Error claiming call:", error);
      setVerificationError("Network error. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleVerificationCancel = () => {
    setShowVerification(false);
    setLastFourDigits("");
    setVerificationError("");
    onClose();
  };

  if (showVerification) {
    return (
      <Dialog open={true} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Verify Call</DialogTitle>
            <DialogDescription>
              To accept this call from {partialNumber}, please enter the last 4
              digits of the caller's phone number.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lastFourDigits">Last 4 digits</Label>
              <Input
                id="lastFourDigits"
                type="text"
                placeholder="1234"
                maxLength={4}
                value={lastFourDigits}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, ""); // Only allow digits
                  setLastFourDigits(value);
                  setVerificationError("");
                }}
                disabled={isVerifying}
                autoFocus
              />
              {verificationError && (
                <p className="text-sm text-red-600">{verificationError}</p>
              )}
            </div>
          </div>
          <DialogFooter className="flex justify-between">
            <Button
              variant="outline"
              onClick={handleVerificationCancel}
              disabled={isVerifying}
            >
              Cancel
            </Button>
            <Button
              onClick={handleVerificationSubmit}
              disabled={isVerifying || lastFourDigits.length !== 4}
            >
              {isVerifying ? "Verifying..." : "Accept Call"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div className="fixed top-4 right-4 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-4 min-w-[300px] animate-in slide-in-from-top-2">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          <h3 className="font-semibold text-gray-900">Incoming Call</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-6 w-6 p-0"
        >
          ×
        </Button>
      </div>

      <div className="mb-4">
        <p className="text-sm text-gray-600">
          Call from:{" "}
          <span className="font-mono font-semibold">{partialNumber}</span>
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Click Accept to answer this call
        </p>
      </div>

      <div className="flex space-x-2">
        <Button
          onClick={handleAccept}
          className="flex-1 bg-green-600 hover:bg-green-700"
        >
          Accept
        </Button>
        <Button onClick={handleIgnore} variant="outline" className="flex-1">
          Ignore
        </Button>
      </div>
    </div>
  );
};

export default IncomingCallToast;
