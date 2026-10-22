import Link from 'next/link';

const cards = [
  { href: '/operator/', title: 'Operator', body: 'Run the show. Password required.' },
  { href: '/display/', title: 'Display', body: 'The big screen. Open full-screen on the projector.' },
];

export default function Home() {
  return (
    <main className="stage min-h-screen flex flex-col items-center justify-center p-6 gap-10">
      <div className="text-center">
        <h1 className="font-display text-7xl sm:text-8xl text-gold">Made Up or Not</h1>
        <p className="text-muted mt-2">Two teams. One category board.</p>
      </div>
      <div className="grid gap-4 w-full max-w-3xl sm:grid-cols-2">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="panel p-5 block hover:border-gold transition-colors">
            <h2 className="text-xl font-bold mb-1">{c.title}</h2>
            <p className="text-sm text-muted">{c.body}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
