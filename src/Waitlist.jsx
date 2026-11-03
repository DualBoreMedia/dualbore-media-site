import { useEffect, useRef, useState } from 'react';
import { merch, previewSizes } from './content';
import { submitWaitlist, waitlistMessage } from './waitlist.js';

export function Waitlist({ item, onSuccess, initialEmail='' }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const confirmation = useRef(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (submitted) confirmation.current?.focus(); }, [submitted]);
  const handleSubmit = async event => {
    event.preventDefault();
    if (pending || submitted) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setPending(true);
    setError('');
    try {
      await submitWaitlist(values);
      if (!mounted.current) return;
      setSubmitted(true);
      onSuccess(waitlistMessage);
    } catch (failure) {
      if (mounted.current) setError(failure.name === 'TimeoutError' || failure instanceof TypeError
        ? 'We could not reach the signup service. Your signup is not confirmed. Please try again.'
        : failure.message);
    } finally { if (mounted.current) setPending(false); }
  };
  if (submitted) return <div className="waitlist-success" ref={confirmation} tabIndex="-1"><span className="success-check" aria-hidden="true">✓</span><h3>You are on the list.</h3><p>{waitlistMessage}</p><small>No payment taken. This is a drop alert, not an order.</small></div>;
  return <form name="drop-waitlist" method="POST" action="/__forms.html" data-netlify="true" netlify-honeypot="bot-field" onSubmit={handleSubmit} className="waitlist-form" aria-busy={pending}>
    <input type="hidden" name="form-name" value="drop-waitlist" />
    <p hidden><label>Leave this empty<input name="bot-field" tabIndex="-1" autoComplete="off" /></label></p>
    <label>Your name<input name="name" autoComplete="name" maxLength="100" required placeholder="First name" /></label>
    <label>Email address<input type="email" name="email" autoComplete="email" maxLength="254" required defaultValue={initialEmail} placeholder="you@example.com" /></label>
    <div className="form-row"><label>Preferred style<select name="style" defaultValue={merch.some(product => product.id === item?.id) ? item.id : ''} required><option value="" disabled>Choose your design</option>{merch.map(product => <option value={product.id} key={product.id}>{product.name}</option>)}</select></label><label>Preferred size<select name="size" defaultValue="" required><option value="" disabled>Select size</option>{previewSizes.map(size => <option key={size}>{size}</option>)}</select></label></div>
    <label className="consent"><input type="checkbox" name="consent" value="yes" required /><span>Email me about DualBore Media’s Drop 01. I can opt out by replying to an update.</span></label>
    <p className="form-privacy">Your name, email, and preferences are stored by Netlify Forms for DualBore Media’s drop updates. This records interest, not an order or size reservation.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button" type="submit" disabled={pending}>{pending ? 'Joining the list…' : 'Join Drop Alert'}</button>
  </form>;
}
