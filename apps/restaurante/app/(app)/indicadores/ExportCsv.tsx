'use client';

/** Baixa as linhas do relatório como planilha (CSV com ; — abre direto no Excel em pt-BR). */
export function ExportCsv({ rows, filename }: { rows: Record<string, string | number>[]; filename: string }) {
  function download() {
    if (!rows.length) return;
    const cols = Object.keys(rows[0]!);
    const esc = (v: string | number) => {
      const s = String(v ?? '');
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [cols.join(';'), ...rows.map((r) => cols.map((c) => esc(r[c] ?? '')).join(';'))].join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <button type="button" className="btn sm" onClick={download} disabled={!rows.length}>
      Baixar planilha
    </button>
  );
}
