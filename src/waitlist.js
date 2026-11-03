import { merch, previewSizes } from './content.js';

export const waitlistMessage = "You are locked in for Drop 01. We will alert you before public release.";

export function encodeWaitlist(values) {
  const name = String(values.name || '').trim();
  const email = String(values.email || '').trim();
  const style = String(values.style || '');
  const size = String(values.size || '');
  if (!name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('Please enter your name and a valid email address.');
  }
  if (!merch.some(item => item.id === style) || !previewSizes.includes(size) || values.consent !== 'yes') {
    throw new Error('Choose a style and size, then agree to receive Drop 01 updates.');
  }
  if (values['bot-field']) throw new Error('We could not submit this form. Please try again.');
  return new URLSearchParams({ 'form-name': 'drop-waitlist', name, email, style, size, consent: 'yes', 'bot-field': '' });
}

export async function submitWaitlist(values, { request = fetch, hostname = window.location.hostname } = {}) {
  const body = encodeWaitlist(values);
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
    throw new Error('This is a local preview. Join the waitlist on the live DualBore Media website.');
  }
  const response = await request('/__forms.html', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(), signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Your signup was not saved. Please try again in a moment.');
}
