import classNames from 'classnames';
import styles from './Card.module.scss';

// tone: default | accent | reward | locked; clickable kartta tüm kart hedeftir.
export default function Card({ as: Tag = 'div', tone = 'default', padding = 'md', className, children, ...rest }) {
  return (
    <Tag className={classNames(styles.card, styles[tone], styles[`p-${padding}`], (rest.onClick || rest.href) && styles.clickable, className)} {...rest}>
      {children}
    </Tag>
  );
}
