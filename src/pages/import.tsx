import { Upload } from 'lucide-react';

export function ImportPage() {
  return (
    <div className="page-stack">
      <header>
        <p className="eyebrow">Bring your history</p>
        <h1>Import from Trakt.</h1>
        <p className="lede">
          Your export will be unpacked in this browser. A guided, resumable importer arrives in the
          next milestone.
        </p>
      </header>
      <div className="upload-zone">
        <Upload size={30} />
        <strong>Trakt account export ZIP</strong>
        <span>No file leaves the browser until you approve the preview.</span>
      </div>
    </div>
  );
}
