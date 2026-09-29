import { redirect } from 'next/navigation';

/** No public landing page: the site opens straight on sign-in (signed-in users go on to the dashboard). */
export default function Home() {
  redirect('/login');
}
