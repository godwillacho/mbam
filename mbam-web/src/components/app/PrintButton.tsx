/**
 * Triggers the browser's native print dialog via `window.print()`. The
 * browser itself hands the resulting job to the host OS's print spooler
 * (CUPS on macOS/Linux, the Windows Print Spooler) once the user confirms
 * in that dialog — there is no supported way for a web page to reach the
 * OS spooler directly, so this is the correct integration point.
 *
 * Pair with the `.no-print` class (see AppShell.css) on any chrome that
 * should not appear in the printed/PDF output, and the `.card` class on
 * the printable content itself (its border/shadow are stripped in print).
 */
interface PrintButtonProps {
  label: string;
  className?: string;
}

export default function PrintButton({ label, className = "primary-btn" }: PrintButtonProps) {
  return (
    <button className={className} type="button" onClick={() => window.print()}>
      {label}
    </button>
  );
}
