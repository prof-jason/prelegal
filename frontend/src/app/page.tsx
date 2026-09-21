"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import NdaDocument from "@/components/NdaDocument";
import NdaFormPanel from "@/components/NdaFormPanel";
import { defaultForm, today, unsupportedPdfChars } from "@/lib/nda";
import styles from "./page.module.css";

const subscribeNever = () => () => {};

export default function Home() {
  const [form, setForm] = useState(defaultForm);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "today" is only known on the client; the server snapshot is "" so hydration matches
  // the prerendered HTML, then React re-renders with the visitor's local date.
  const clientToday = useSyncExternalStore(subscribeNever, () => today(), () => "");
  const resolved = useMemo(
    () => (form.effectiveDate === null ? { ...form, effectiveDate: clientToday } : form),
    [form, clientToday],
  );

  const missing = [
    !resolved.governingLaw.trim() && "governing law",
    !resolved.jurisdiction.trim() && "jurisdiction",
  ].filter(Boolean);
  const badChars = unsupportedPdfChars(resolved);

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const { buildNdaPdf } = await import("@/lib/ndaPdf");
      const url = URL.createObjectURL(await buildNdaPdf(resolved));
      const a = document.createElement("a");
      a.href = url;
      a.download = "Mutual-NDA.pdf";
      document.body.appendChild(a); // some browsers ignore clicks on detached anchors
      a.click();
      a.remove();
      // Revoking immediately can cancel the download in Safari/Firefox.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      console.error(e);
      setError("Sorry, the PDF could not be generated. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div>
          <h1>Mutual NDA Creator</h1>
          <p>Fill in the details and watch your agreement update live.</p>
        </div>
        <div className={styles.actions}>
          <button onClick={download} disabled={busy} aria-busy={busy}>
            {busy ? "Generating…" : "Download PDF"}
          </button>
        </div>
      </header>
      <p className={styles.disclaimer}>
        This tool fills in a standard template agreement (Common Paper Mutual NDA v1.0). It does not provide legal
        advice — have a qualified attorney review any agreement before you sign it.
      </p>
      {(missing.length > 0 || badChars.length > 0) && (
        <div role="status" className={styles.notice}>
          {missing.length > 0 && (
            <p>
              The {missing.join(" and ")} {missing.length > 1 ? "are" : "is"} still empty, so the agreement will
              contain a [placeholder] there.
            </p>
          )}
          {badChars.length > 0 && (
            <p>
              These characters may not appear correctly in the PDF: <strong>{badChars.join(" ")}</strong>
            </p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.layout}>
        <section className={styles.formCol} aria-label="Agreement details">
          <NdaFormPanel form={resolved} onChange={setForm} />
        </section>
        <section className={styles.previewCol} aria-label="Agreement preview">
          <NdaDocument form={resolved} />
        </section>
      </div>
    </main>
  );
}
