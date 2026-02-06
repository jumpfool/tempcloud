"use client";

import { useState, useEffect, use } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  getFileInfo,
  downloadFile,
  formatBytes,
  formatTimeLeft,
  type FileInfoResponse,
} from "@/lib/api";

type PageState = "loading" | "ready" | "password" | "downloading" | "expired" | "error";

const fade = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.125, ease: "easeOut" as const },
} as const;

export default function DownloadPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = use(params);
  const [state, setState] = useState<PageState>("loading");
  const [info, setInfo] = useState<FileInfoResponse | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    getFileInfo(uuid)
      .then((data) => {
        setInfo(data);
        if (data.has_password) {
          setState("password");
        } else {
          setState("ready");
        }
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "File not found";
        if (msg.includes("expired") || msg.includes("not found")) {
          setState("expired");
        } else {
          setState("error");
        }
        setError(msg);
      });
  }, [uuid]);

  const handleDownload = async () => {
    setPasswordError("");
    setState("downloading");
    const result = await downloadFile(
      uuid,
      info?.has_password ? password : undefined
    );
    if (!result.ok) {
      if (result.code === "INVALID_PASSWORD") {
        setPasswordError("Wrong password");
        setState("password");
      } else if (result.code === "PASSWORD_REQUIRED") {
        setPasswordError("Password is required");
        setState("password");
      } else {
        setError(result.error);
        setState("error");
      }
      return;
    }
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setState(info?.has_password ? "password" : "ready");
  };

  return (
    <AnimatePresence mode="wait">
      {state === "loading" && (
        <motion.div
          key="loading"
          className="space-y-6"
          initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
        >
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Separator />
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <Separator />
          <Skeleton className="h-9 w-full rounded-md" />
        </motion.div>
      )}

      {(state === "expired" || state === "error") && (
        <motion.div
          key="error"
          className="space-y-6"
          {...fade}
        >
          <div>
            <h1 className="text-lg font-medium">File unavailable</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {state === "expired"
                ? "This file has expired or been deleted."
                : error || "Something went wrong."}
            </p>
          </div>
          <Separator />
          <Button variant="outline" className="w-full" asChild>
            <a href="/">Upload a new file</a>
          </Button>
        </motion.div>
      )}

      {(state === "ready" || state === "password" || state === "downloading") && (
        <motion.div
          key="ready"
          className="space-y-6"
          initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
        >
          <div>
            <h1 className="text-lg font-medium">Download file</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Review the file details before downloading.
            </p>
          </div>

          <Separator />

          {info && (
              <motion.div
              className="space-y-3"
              initial="initial"
              animate="animate"
              variants={{ animate: { transition: { staggerChildren: 0.02 } } }}
            >
              <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                {[
                  ["Name", info.filename],
                  ["Size", formatBytes(info.size)],
                  ["Type", info.mime],
                  ["Expires", formatTimeLeft(info.expires_at)],
                  ...(info.downloads_left !== null
                    ? [["Downloads left", String(info.downloads_left)]]
                    : []),
                ].map(([label, value]) => (
                  <motion.div
                    key={label}
                    className="contents"
                    variants={{
                      initial: { opacity: 0, x: -4 },
                      animate: { opacity: 1, x: 0 },
                    }}
                    transition={{ duration: 0.1 }}
                  >
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-mono truncate">{value}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          <Separator />

          <AnimatePresence>
            {state === "password" && (
              <motion.div
                className="space-y-3"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.125, ease: "easeOut" }}
              >
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  This file is password protected
                </Label>
                <Input
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setPasswordError(""); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && password) handleDownload();
                  }}
                />
                <AnimatePresence>
                  {passwordError && (
                    <motion.p
                      className="text-sm text-destructive"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.075 }}
                    >
                      {passwordError}
                    </motion.p>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>

          <Button
            onClick={handleDownload}
            disabled={(state === "password" && !password) || state === "downloading"}
            className="w-full"
          >
            <AnimatePresence mode="wait">
              {state === "downloading" ? (
                <motion.span
                  key="downloading"
                  className="flex items-center gap-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.075 }}
                >
                  <Spinner />
                  Downloading...
                </motion.span>
              ) : (
                <motion.span
                  key="download"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.075 }}
                >
                  Download
                </motion.span>
              )}
            </AnimatePresence>
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Skeleton({ className }: { className?: string }) {
  return (
    <motion.div
      className={`bg-muted rounded ${className}`}
      animate={{ opacity: [0.4, 1, 0.4] }}
      transition={{ duration: 0.75, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

function Spinner() {
  return (
    <motion.div
      className="h-4 w-4 border border-primary-foreground/30 border-t-primary-foreground rounded-full"
      animate={{ rotate: 360 }}
      transition={{ duration: 0.4, repeat: Infinity, ease: "linear" }}
    />
  );
}
