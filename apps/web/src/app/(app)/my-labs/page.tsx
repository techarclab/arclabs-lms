import { redirect } from 'next/navigation';

/** Lab marks are for faculty only; students who open an old link go to their dashboard. */
export default function MyLabsPage() {
  redirect('/dashboard');
}
