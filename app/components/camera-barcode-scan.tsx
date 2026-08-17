import { useEffect, useRef, useState } from "react";

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<{ rawValue: string }[]>;
};

export function CameraBarcodeScan({
  onDetected,
}: {
  onDetected: (value: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastValue = useRef("");
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!active) return;
    const video = videoRef.current;
    if (!video) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let raf = 0;
    let zxingControls: { stop: () => void } | null = null;

    const emit = (value: string) => {
      if (!value || value === lastValue.current) return;
      lastValue.current = value;
      onDetected(value);
    };

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (!video || stopped) return;
        video.srcObject = stream;
        await video.play();

        const Detector = (
          window as Window & {
            BarcodeDetector?: new (options?: {
              formats: string[];
            }) => BarcodeDetectorLike;
          }
        ).BarcodeDetector;
        if (Detector) {
          const detector = new Detector({
            formats: ["qr_code", "code_128", "code_39", "ean_13", "ean_8"],
          });
          const tick = async () => {
            if (stopped || !video) return;
            try {
              if (video.readyState >= 2) {
                const codes = await detector.detect(video);
                emit(codes[0]?.rawValue?.trim() ?? "");
              }
            } catch {
              // Keep scanning if a frame fails.
            }
            raf = window.requestAnimationFrame(() => {
              void tick();
            });
          };
          void tick();
          return;
        }

        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        zxingControls = await reader.decodeFromStream(stream, video, (result) =>
          emit(result?.getText()?.trim() ?? ""),
        );
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to open the camera. Use HTTPS or allow camera access.",
        );
      }
    }

    void start();
    return () => {
      stopped = true;
      window.cancelAnimationFrame(raf);
      zxingControls?.stop();
      stream?.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    };
  }, [active, onDetected]);

  return (
    <div className="stack">
      {!active ? (
        <button
          type="button"
          className="button button-secondary"
          onClick={() => {
            setError(null);
            lastValue.current = "";
            setActive(true);
          }}
        >
          Use camera
        </button>
      ) : (
        <>
          <video
            ref={videoRef}
            muted
            playsInline
            style={{ width: "100%", borderRadius: 12, background: "#000" }}
          />
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setActive(false)}
          >
            Stop camera
          </button>
        </>
      )}
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
