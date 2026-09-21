"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import NdaDocument from "@/components/NdaDocument";
import NdaFormPanel from "@/components/NdaFormPanel";
import { defaultForm, today } from "@/lib/nda";
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

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const { buildNdaPdf } = await import("@/lib/ndaPdf");
      const url = URL.createObjectURL(await buildNdaPdf(resolved));
      const a = document.createElement("a");
      a.href = url;
      a.download = "Mutual-NDA.pdf";
      a.click();
      URL.revokeObjectURL(url);
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
          <button onClick={download} disabled={busy}>
            {busy ? "Generating…" : "Download PDF"}
          </button>
        </div>
      </header>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.layout}>
        <section className={styles.formCol}>
          <NdaFormPanel form={resolved} onChange={setForm} />
        </section>
        <section className={styles.previewCol}>
          <NdaDocument form={resolved} />
        </section>
      </div>
    </main>
  );
}
