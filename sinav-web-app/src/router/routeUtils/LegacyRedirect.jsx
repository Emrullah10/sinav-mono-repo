import { Navigate, useLocation, useParams } from 'react-router-dom';
import { path } from '@shared/constant/route-paths';

// Old Turkish URL → current English route, keeping params, query and hash (emails, payment return URLs, bookmarks).
export default function LegacyRedirect({ to }) {
  const params = useParams();
  const { search, hash } = useLocation();
  return <Navigate to={`${path(to, params)}${search}${hash}`} replace />;
}
