"use client";

import { useState } from "react";
import NdaDocument from "@/components/NdaDocument";
import NdaFormPanel from "@/components/NdaFormPanel";
import { defaultForm } from "@/lib/nda";
import styles from "./page.module.css";

// Rendered per request so the default effective date is never a stale build-time value.
export const dynamic = "force-dynamic";

const DOC_CSS = `body{font-family:Georgia,"Times New Roman",serif;font-size:15px;line-height:1.55;color:#111;max-width:800px;margin:40px auto;padding:0 24px}
h1{font-size:24px;text-align:center}h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em}
table{width:100%;border-collapse:collapse;margin:20px 0}th,td{border:1px solid #bbb;padding:10px;text-align:left;vertical-align:top;height:38px}
li{margin-bottom:12px}[class*=hint]{color:#666;font-style:italic;font-size:13px}[class*=attribution]{font-size:12px;color:#666}[class*=pageBreak]{break-before:page}`;

export default function Home() {
  const [form, setForm] = useState(defaultForm);

  const download = () => {
    const el = document.getElementById("nda-document");
    if (!el) return;
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Mutual NDA</title><style>${DOC_CSS}</style></head><body>${el.innerHTML}</body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "Mutual-NDA.html";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div>
          <h1>Mutual NDA Creator</h1>
          <p>Fill in the details and watch your agreement update live.</p>
        </div>
        <div className={styles.actions}>
          <button onClick={download}>Download (.html)</button>
          <button onClick={() => window.print()}>Print / Save as PDF</button>
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
