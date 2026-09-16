import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createLeadsBulk } from "@/lib/db";
import { downloadFile, parseCsv } from "@/lib/csv";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/overlays";
import { Button } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import {
  autoMapHeader,
  csvRowToLead,
  LEAD_CSV_COLUMNS,
  leadCsvTemplate,
} from "./leadCsv";
import type { Lead } from "@/types";

const FIELD_OPTIONS = ["", ...LEAD_CSV_COLUMNS.map((c) => c.key)];

export function LeadCsvModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showSpec, setShowSpec] = useState(false);

  const reset = () => {
    setStep(1);
    setFileName("");
    setHeaders([]);
    setDataRows([]);
    setMapping({});
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleFile = async (file: File) => {
    if (!/\.csv$/i.test(file.name)) {
      toast.error("Please choose a .csv file");
      return;
    }
    const grid = parseCsv(await file.text());
    if (grid.length < 2) {
      toast.error("That file has no data rows");
      return;
    }
    const hdr = grid[0];
    setFileName(file.name);
    setHeaders(hdr);
    setDataRows(grid.slice(1));
    setMapping(Object.fromEntries(hdr.map((h, i) => [i, autoMapHeader(h)])));
    setStep(2);
  };

  // build records + validation
  const parsed = useMemo(() => {
    if (step < 3) return null;
    const usedKeys = Object.values(mapping).filter(Boolean);
    const results = dataRows.map((cells) => {
      const record: Record<string, string> = {};
      headers.forEach((_h, i) => {
        const key = mapping[i];
        if (key) record[key] = cells[i] ?? "";
      });
      return csvRowToLead(record);
    });
    return {
      hasName: usedKeys.includes("full_name"),
      valid: results.filter((r) => r.payload) as { payload: Partial<Lead>; warnings: string[] }[],
      invalid: results
        .map((r, i) => ({ row: i + 2, errors: r.errors }))
        .filter((r) => r.errors.length),
      warnings: results
        .map((r, i) => ({ row: i + 2, warnings: r.warnings }))
        .filter((r) => r.warnings.length),
    };
  }, [step, dataRows, headers, mapping]);

  const doImport = async () => {
    if (!parsed) return;
    setImporting(true);
    try {
      const n = await createLeadsBulk(parsed.valid.map((v) => v.payload));
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast.success(
        `Imported ${n} lead${n === 1 ? "" : "s"}` +
          (parsed.invalid.length ? ` · skipped ${parsed.invalid.length}` : ""),
      );
      close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Import leads from CSV" width="max-w-2xl">
      <div className="mb-4 flex items-center gap-2 text-xs">
        {["Upload", "Map columns", "Review & import"].map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                step >= i + 1 ? "bg-primary text-white" : "bg-line text-muted",
              )}
            >
              {i + 1}
            </span>
            <span className={step >= i + 1 ? "text-ink" : "text-muted"}>{label}</span>
            {i < 2 && <span className="text-line">—</span>}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-3">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
            }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-3 rounded-card border-2 border-dashed px-6 py-12 text-center transition",
              dragOver ? "border-primary bg-primary/5" : "border-line hover:border-primary/50",
            )}
          >
            <Icon name="upload" size={26} className="text-muted" />
            <div>
              <p className="text-sm font-medium text-ink">Drop your CSV here, or click to browse</p>
              <p className="text-xs text-muted">
                Headers like "Company", "Email", "Stage" are auto-detected.
              </p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>

          <div className="flex items-center justify-between rounded-control bg-surface-2 px-3 py-2">
            <span className="text-xs text-muted">Not sure of the format?</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowSpec((s) => !s)}
              >
                {showSpec ? "Hide" : "View"} field guide
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => downloadFile("roseway-leads-template.csv", leadCsvTemplate())}
              >
                <Icon name="upload" size={13} /> Download template
              </Button>
            </div>
          </div>

          {showSpec && (
            <div className="max-h-64 overflow-y-auto rounded-control border border-line">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-line bg-surface-2 text-left text-muted">
                    <th className="px-3 py-2 font-semibold">Column</th>
                    <th className="px-3 py-2 font-semibold">Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  {LEAD_CSV_COLUMNS.map((c) => (
                    <tr key={c.key} className="border-b border-line/60 last:border-0">
                      <td className="whitespace-nowrap px-3 py-2 align-top font-mono text-ink">
                        {c.header}
                        {c.required && <span className="text-danger"> *</span>}
                      </td>
                      <td className="px-3 py-2 text-muted">{c.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Match each column in <span className="font-medium text-ink">{fileName}</span> to a
            Roseway field. Leave unmatched columns as "— Ignore —".
          </p>
          <div className="max-h-72 overflow-y-auto rounded-control border border-line">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-left text-muted">
                  <th className="px-3 py-2 font-semibold">CSV column</th>
                  <th className="px-3 py-2 font-semibold">Sample</th>
                  <th className="px-3 py-2 font-semibold">Maps to</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((h, i) => (
                  <tr key={i} className="border-b border-line/60 last:border-0">
                    <td className="px-3 py-2 font-medium text-ink">{h || <em className="text-muted">(blank)</em>}</td>
                    <td className="max-w-[160px] truncate px-3 py-2 text-muted">{dataRows[0]?.[i] ?? ""}</td>
                    <td className="px-3 py-2">
                      <select
                        value={mapping[i] ?? ""}
                        onChange={(e) => setMapping((m) => ({ ...m, [i]: e.target.value }))}
                        className="w-full rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink"
                      >
                        {FIELD_OPTIONS.map((f) => (
                          <option key={f} value={f}>
                            {f === "" ? "— Ignore —" : f}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!Object.values(mapping).includes("full_name") && (
            <p className="rounded-control bg-danger/10 px-3 py-2 text-xs text-danger">
              Map one column to <span className="font-mono">full_name</span> to continue — it's required.
            </p>
          )}
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button
              onClick={() => setStep(3)}
              disabled={!Object.values(mapping).includes("full_name")}
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === 3 && parsed && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Rows in file" value={dataRows.length} />
            <Stat label="Will import" value={parsed.valid.length} tone="success" />
            <Stat label="Will skip" value={parsed.invalid.length} tone={parsed.invalid.length ? "danger" : undefined} />
          </div>

          {parsed.invalid.length > 0 && (
            <div className="max-h-32 overflow-y-auto rounded-control border border-danger/30 bg-danger/5 p-2 text-xs text-danger">
              {parsed.invalid.slice(0, 30).map((r) => (
                <p key={r.row}>Row {r.row}: {r.errors.join("; ")}</p>
              ))}
            </div>
          )}
          {parsed.warnings.length > 0 && (
            <div className="max-h-32 overflow-y-auto rounded-control border border-warning/30 bg-warning/5 p-2 text-xs text-warning">
              {parsed.warnings.slice(0, 30).map((r) => (
                <p key={r.row}>Row {r.row}: {r.warnings.join("; ")}</p>
              ))}
            </div>
          )}

          <p className="text-xs text-muted">
            New leads are created with <span className="font-mono">source = import</span> unless the
            file sets one. Existing leads are never overwritten — this only adds rows.
          </p>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button onClick={doImport} loading={importing} disabled={parsed.valid.length === 0}>
              Import {parsed.valid.length} lead{parsed.valid.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "danger";
}) {
  return (
    <div className="card-base p-3 text-center">
      <p
        className={cn(
          "text-lg font-bold",
          tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-ink",
        )}
      >
        {value}
      </p>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
    </div>
  );
}
