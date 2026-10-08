import styles from './Skeleton.module.scss';

export default function Skeleton({ height = 16, width = '100%', radius = 8, style }) {
  return <div className={styles.sk} style={{ height, width, borderRadius: radius, ...style }} aria-hidden />;
}
export const SkeletonList = ({ rows = 3, height = 64 }) => (
  <div className="stack-sm" aria-busy="true">{Array.from({ length: rows }, (_x, i) => <Skeleton key={i} height={height} radius={16} />)}</div>
);
