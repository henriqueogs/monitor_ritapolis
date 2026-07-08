import LoginForm from './LoginForm';
import styles from './styles.module.css';

export const metadata = {
  title: 'Login administrativo',
};

export default function LoginPage() {
  return (
    <main className={styles.loginShell}>
      <section className={styles.loginPanel}>
        <div className={styles.brandBlock}>
          <span className={styles.brandMark}>MR</span>
          <div>
            <p>Ritápolis.com</p>
            <h1>Acesso administrativo</h1>
          </div>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
