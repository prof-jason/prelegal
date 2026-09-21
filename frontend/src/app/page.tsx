"use client";

import { useState } from "react";
import NdaDocument from "@/components/NdaDocument";
import NdaFormPanel from "@/components/NdaFormPanel";
import { defaultForm } from "@/lib/nda";
import styles from "./page.module.css";

// Rendered per request so the default effective date is never a stale build-time value.
export const dynamic = "force-dynamic";

export default function Home() {
  const [form, setForm] = useState(defaultForm);

  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const { buildNdaPdf } = await import("@/lib/ndaPdf");
      const url = URL.createObjectURL(await buildNdaPdf(form));
      const a = document.createElement("a");
      a.href = url;
      a.download = "Mutual-NDA.pdf";
      a.click();
      URL.revokeObjectURL(url);
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
      <div className={styles.layout}>
        <section className={styles.formCol}>
          <NdaFormPanel form={form} onChange={setForm} />
        </section>
        <section className={styles.previewCol}>
          <NdaDocument form={form} />
        </section>
      </div>
    </main>
  );
}
