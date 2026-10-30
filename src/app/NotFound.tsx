import { Link } from 'react-router';

export function NotFound() {
  return (
    <div className="app-main">
      <p className="eyebrow">404</p>
      <h1 className="ff-title">Melted away</h1>
      <p className="text-ink-2">This page does not exist.</p>
      <Link to="/" className="pill">
        Go to Today
      </Link>
    </div>
  );
}
