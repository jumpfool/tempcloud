"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { initUpload, uploadFile, finalizeUpload, formatBytes } from "@/lib/api";

type UploadState = "idle" | "uploading" | "finalizing" | "done" | "error";

const EXPIRY_OPTIONS = [
  { value: "300", label: "5 minutes" },
  { value: "1800", label: "30 minutes" },
  { value: "3600", label: "1 hour" },
  { value: "14400", label: "4 hours" },
  { value: "86400", label: "24 hours" },
  { value: "604800", label: "7 days" },
];

const fade = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.125, ease: "easeOut" },
} as const;

const stagger = {
  animate: { transition: { staggerChildren: 0.03 } },
};

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [expiresIn, setExpiresIn] = useState("3600");
  const [maxDownloads, setMaxDownloads] = useState("");
  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [downloadLink, setDownloadLink] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleUpload = async () => {
    if (!file) return;

    setState("uploading");
    setProgress(0);
    setError("");

    try {
      const initRes = await initUpload({
        filename: file.name,
        size: file.size,
        mime: file.type || "application/octet-stream",
        expires_in: parseInt(expiresIn),
        max_downloads: maxDownloads ? parseInt(maxDownloads) : undefined,
        password: usePassword && password ? password : undefined,
      });

      await uploadFile(initRes.upload_url, file, setProgress);

      setState("finalizing");
      const finalRes = await finalizeUpload(initRes.file_uuid);
      setDownloadLink(`${window.location.origin}/d/${initRes.file_uuid}`);
      setState("done");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(downloadLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setFile(null);
    setState("idle");
    setProgress(0);
    setDownloadLink("");
    setError("");
    setPassword("");
    setUsePassword(false);
    setMaxDownloads("");
    setCopied(false);
  };

  return (
    <AnimatePresence mode="wait">
      {state === "done" ? (
        <motion.div
          key="done"
          className="space-y-6"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.175, ease: "easeOut" }}
        >
          <motion.div {...fade}>
            <h1 className="text-lg font-medium">File uploaded</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Share this link. It will expire automatically.
            </p>
          </motion.div>

          <Separator />

          <motion.div className="space-y-3" {...fade} transition={{ delay: 0.05, duration: 0.125 }}>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              Download link
            </Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={downloadLink}
                className="font-mono text-sm"
                onClick={(e) => e.currentTarget.select()}
              />
              <Button
                variant="outline"
                onClick={handleCopy}
                className="shrink-0 min-w-[80px]"
              >
                <AnimatePresence mode="wait">
                  <motion.span
                    key={copied ? "copied" : "copy"}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.075 }}
                  >
                    {copied ? "Copied" : "Copy"}
                  </motion.span>
                </AnimatePresence>
              </Button>
            </div>
          </motion.div>

          <motion.div
            className="flex flex-wrap gap-3 text-xs text-muted-foreground font-mono"
            variants={stagger}
            initial="initial"
            animate="animate"
          >
            {[
              file?.name,
              formatBytes(file?.size || 0),
              `expires in ${EXPIRY_OPTIONS.find((o) => o.value === expiresIn)?.label}`,
              maxDownloads ? `${maxDownloads} download${parseInt(maxDownloads) !== 1 ? "s" : ""}` : null,
              usePassword && password ? "password protected" : null,
            ]
              .filter(Boolean)
              .map((label, i) => (
                <motion.span
                  key={i}
                  className="border px-2 py-1 rounded"
                  variants={fade}
                >
                  {label}
                </motion.span>
              ))}
          </motion.div>

          <Separator />

          <motion.div {...fade} transition={{ delay: 0.1, duration: 0.125 }}>
            <Button variant="outline" onClick={handleReset} className="w-full">
              Upload another file
            </Button>
          </motion.div>
        </motion.div>
      ) : (
        <motion.div
          key="upload"
          className="space-y-6"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.175, ease: "easeOut" }}
        >
          <div>
            <h1 className="text-lg font-medium">Upload a file</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Files are encrypted at rest and expire automatically.
            </p>
          </div>

          <Separator />

          <motion.div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            animate={{
              borderColor: dragActive
                ? "var(--foreground)"
                : file
                ? "var(--foreground)"
                : "var(--border)",
              backgroundColor: dragActive ? "var(--muted)" : "transparent",
            }}
            transition={{ duration: 0.1 }}
            className="border border-dashed rounded-lg p-10 text-center cursor-pointer hover:border-foreground/30"
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) setFile(e.target.files[0]);
              }}
            />
            <AnimatePresence mode="wait">
              {file ? (
                <motion.div
                      key="file-selected"
                        className="space-y-1"
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ duration: 0.1 }}
                >
                  <p className="text-sm font-medium font-mono">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(file.size)} &middot; {file.type || "unknown type"}
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="file-empty"
                  className="space-y-1"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1 }}
                >
                  <p className="text-sm text-muted-foreground">
                    Drop a file here or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground">Max 100 MB</p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  Expires after
                </Label>
                <Select value={expiresIn} onValueChange={setExpiresIn}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPIRY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  Max downloads
                </Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="Unlimited"
                  value={maxDownloads}
                  onChange={(e) => setMaxDownloads(e.target.value)}
                />
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm">Password protection</Label>
                <p className="text-xs text-muted-foreground">
                  Require a password to download
                </p>
              </div>
              <Switch checked={usePassword} onCheckedChange={setUsePassword} />
            </div>

            <AnimatePresence>
              {usePassword && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.1, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  <Input
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <Separator />

          <AnimatePresence>
            {(state === "uploading" || state === "finalizing") && (
                <motion.div
                className="space-y-3"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.125 }}
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground font-mono">
                    {state === "uploading"
                      ? `Uploading... ${progress}%`
                      : "Finalizing..."}
                  </span>
                  {state === "finalizing" && (
                    <Spinner />
                  )}
                </div>
                <Progress value={state === "finalizing" ? 100 : progress} className="h-1" />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {state === "error" && (
                <motion.div
                className="border border-destructive/50 rounded-lg px-4 py-3"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.1 }}
              >
                <p className="text-sm text-destructive">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <Button
            onClick={handleUpload}
            disabled={!file || state === "uploading" || state === "finalizing"}
            className="w-full"
          >
            {state === "uploading"
              ? "Uploading..."
              : state === "finalizing"
              ? "Finalizing..."
              : "Upload"}
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Spinner() {
  return (
    <motion.div
      className="h-4 w-4 border border-foreground/30 border-t-foreground rounded-full"
      animate={{ rotate: 360 }}
      transition={{ duration: 0.4, repeat: Infinity, ease: "linear" }}
    />
  );
}
