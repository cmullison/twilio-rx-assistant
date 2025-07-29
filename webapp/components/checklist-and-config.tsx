"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Circle, CheckCircle, Loader2 } from "lucide-react";
import { PhoneNumber } from "@/components/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getBackendHttpUrl } from "@/lib/config";

export default function ChecklistAndConfig({
  ready,
  setReady,
  selectedPhoneNumber,
  setSelectedPhoneNumber,
}: {
  ready: boolean;
  setReady: (val: boolean) => void;
  selectedPhoneNumber: string;
  setSelectedPhoneNumber: (val: string) => void;
}) {
  const [hasCredentials, setHasCredentials] = useState(false);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [currentNumberSid, setCurrentNumberSid] = useState("");
  const [currentVoiceUrl, setCurrentVoiceUrl] = useState("");

  const [publicUrl, setPublicUrl] = useState("");
  const [localServerUp, setLocalServerUp] = useState(false);
  const [publicUrlAccessible, setPublicUrlAccessible] = useState(false);

  const [allChecksPassed, setAllChecksPassed] = useState(false);
  const [webhookLoading, setWebhookLoading] = useState(false);

  const appendedTwimlUrl = publicUrl ? `${publicUrl}/twiml` : "";
  const isWebhookMismatch =
    appendedTwimlUrl && currentVoiceUrl && appendedTwimlUrl !== currentVoiceUrl;

  useEffect(() => {
    let polling = true;

    const pollChecks = async () => {
      try {
        // 1. Check credentials
        let res = await fetch(`${getBackendHttpUrl()}/twilio/credentials`);
        if (!res.ok) throw new Error("Failed credentials check");
        const credData = (await res.json()) as { credentialsSet?: boolean };
        setHasCredentials(!!credData?.credentialsSet);

        // 2. Fetch numbers
        res = await fetch(`${getBackendHttpUrl()}/twilio/numbers`);
        if (!res.ok) throw new Error("Failed to fetch phone numbers");
        const numbersData = await res.json();
        if (Array.isArray(numbersData) && numbersData.length > 0) {
          setPhoneNumbers(numbersData);
          // If currentNumberSid not set or not in the list, use first
          const selected =
            numbersData.find((p: PhoneNumber) => p.sid === currentNumberSid) ||
            numbersData[0];
          setCurrentNumberSid(selected.sid);
          setCurrentVoiceUrl(selected.voiceUrl || selected.voice_url || "");
          setSelectedPhoneNumber(
            selected.friendlyName || selected.friendly_name || ""
          );
        }

        // 3. Check Cloudflare Worker & get public URL
        let foundPublicUrl = "";
        try {
          const resWorker = await fetch(`${getBackendHttpUrl()}/public-url`);
          if (resWorker.ok) {
            const pubData = (await resWorker.json()) as { publicUrl?: string };
            foundPublicUrl = pubData?.publicUrl || "";
            setLocalServerUp(true);
            setPublicUrl(foundPublicUrl);
            setPublicUrlAccessible(true); // Cloudflare Workers are always publicly accessible
          } else {
            throw new Error("Cloudflare Worker not responding");
          }
        } catch {
          setLocalServerUp(false);
          setPublicUrl("");
          setPublicUrlAccessible(false);
        }
      } catch (err) {
        console.error(err);
      }
    };

    pollChecks();
    const intervalId = setInterval(() => polling && pollChecks(), 1000);
    return () => {
      polling = false;
      clearInterval(intervalId);
    };
  }, [currentNumberSid, setSelectedPhoneNumber]);

  const updateWebhook = async () => {
    if (!currentNumberSid || !appendedTwimlUrl) return;
    try {
      setWebhookLoading(true);
      const res = await fetch(`${getBackendHttpUrl()}/twilio/numbers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumberSid: currentNumberSid,
          voiceUrl: appendedTwimlUrl,
        }),
      });
      if (!res.ok) throw new Error("Failed to update webhook");
      setCurrentVoiceUrl(appendedTwimlUrl);
    } catch (err) {
      console.error(err);
    } finally {
      setWebhookLoading(false);
    }
  };

  const checklist = useMemo(() => {
    return [
      {
        label: "Set up Twilio account",
        done: hasCredentials,
        description: "Then update account details in webapp/.env",
        field: (
          <Button
            className="w-full"
            onClick={() => window.open("https://console.twilio.com/", "_blank")}
          >
            Open Twilio Console
          </Button>
        ),
      },
      {
        label: "Set up Twilio phone number",
        done: phoneNumbers.length > 0,
        description: "Costs around $1.15/month",
        field:
          phoneNumbers.length > 0 ? (
            phoneNumbers.length === 1 ? (
              <Input
                value={
                  phoneNumbers[0].friendlyName ||
                  phoneNumbers[0].friendly_name ||
                  ""
                }
                disabled
              />
            ) : (
              <Select
                onValueChange={(value) => {
                  setCurrentNumberSid(value);
                  const selected = phoneNumbers.find((p) => p.sid === value);
                  if (selected) {
                    setSelectedPhoneNumber(
                      selected.friendlyName || selected.friendly_name || ""
                    );
                    setCurrentVoiceUrl(
                      selected.voiceUrl || selected.voice_url || ""
                    );
                  }
                }}
                value={currentNumberSid}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a phone number" />
                </SelectTrigger>
                <SelectContent>
                  {phoneNumbers.map((phone) => (
                    <SelectItem key={phone.sid} value={phone.sid}>
                      {phone.friendlyName || phone.friendly_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )
          ) : (
            <Button
              className="w-full"
              onClick={() =>
                window.open(
                  "https://console.twilio.com/us1/develop/phone-numbers/manage/incoming",
                  "_blank"
                )
              }
            >
              Set up Twilio phone number
            </Button>
          ),
      },
      {
        label: "Deploy Cloudflare Worker",
        done: localServerUp,
        description: "cd do-server && npm run deploy",
        field: localServerUp ? (
          <Input value={publicUrl} disabled className="w-full" />
        ) : (
          <Button
            className="w-full"
            onClick={() =>
              window.open("https://workers.cloudflare.com/", "_blank")
            }
          >
            Open Cloudflare Dashboard
          </Button>
        ),
      },
      {
        label: "Update Twilio webhook URL",
        done: !!publicUrl && !isWebhookMismatch,
        description: "Can also be done manually in Twilio console",
        field: (
          <div className="flex items-center gap-2 w-full">
            <div className="flex-1">
              <Input
                value={
                  currentVoiceUrl ||
                  (appendedTwimlUrl
                    ? "Not configured"
                    : "Waiting for worker URL...")
                }
                disabled
                className="w-full"
              />
            </div>
            <div className="flex-1">
              <Button
                onClick={updateWebhook}
                disabled={webhookLoading || !appendedTwimlUrl}
                className="w-full"
              >
                {webhookLoading ? (
                  <Loader2 className="mr-2 h-4 animate-spin" />
                ) : (
                  "Update Webhook"
                )}
              </Button>
            </div>
          </div>
        ),
      },
    ];
  }, [
    hasCredentials,
    phoneNumbers,
    currentNumberSid,
    localServerUp,
    publicUrl,
    publicUrlAccessible,
    currentVoiceUrl,
    isWebhookMismatch,
    appendedTwimlUrl,
    webhookLoading,
    setSelectedPhoneNumber,
  ]);

  useEffect(() => {
    setAllChecksPassed(checklist.every((item) => item.done));
  }, [checklist]);

  // Cloudflare Workers are always publicly accessible, no need to check ngrok

  useEffect(() => {
    if (!allChecksPassed) {
      setReady(false);
    }
  }, [allChecksPassed, setReady]);

  const handleDone = () => setReady(true);

  return (
    <Dialog open={!ready}>
      <DialogContent className="w-full max-w-[800px]">
        <DialogHeader>
          <DialogTitle>Setup Checklist</DialogTitle>
          <DialogDescription>
            This sample app requires a few steps before you get started
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-0">
          {checklist.map((item, i) => (
            <div
              key={i}
              className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 py-2"
            >
              <div className="flex flex-col">
                <div className="flex items-center gap-2 mb-1">
                  {item.done ? (
                    <CheckCircle className="text-green-500" />
                  ) : (
                    <Circle className="text-gray-400" />
                  )}
                  <span className="font-medium">{item.label}</span>
                </div>
                {item.description && (
                  <p className="text-sm text-gray-500 ml-8">
                    {item.description}
                  </p>
                )}
              </div>
              <div className="flex items-center mt-2 sm:mt-0">{item.field}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-col sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={handleDone}
            disabled={!allChecksPassed}
          >
            Let's go!
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
