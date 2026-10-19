import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { merch, previewSizes } from '../../src/content.js';

const formName = 'drop-waitlist';
const subject = "You're on the DualBore Media Drop 01 list";
const isEmail = value => typeof value === 'string' && value.length <= 254
  && /^[^\s@,;<>]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(value);

export function validateSubmission(event) {
  // Netlify's current FormSubmittedEvent is { data: Record<string, string> }.
  const data = event?.data;
  if (!data || data['form-name'] !== formName) return { status: 'ignored' };
  if (Object.values(data).some(value => typeof value !== 'string')) return { status: 'invalid' };
  const name = data.name?.trim();
  const email = data.email?.trim();
  const product = merch.find(item => item.id === data.style);
  if (!name || name.length > 100 || /[\r\n\x00-\x1f]/.test(name) || !isEmail(email)
    || data.consent !== 'yes' || data['bot-field'] || !product || !previewSizes.includes(data.size)) {
    return { status: 'invalid' };
  }
  return { status: 'valid', name, email, style: product.name, size: data.size };
}

export function escapeHtml(value) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

export function confirmationMessage(submission) {
  const { name, style, size } = submission;
  const text = `Hi ${name},\n\nYou're on the DualBore Media Drop 01 list.\n\nWe saved your interest in:\nDesign: ${style}\nSize: ${size}\n\nThis is only a drop notification list. It is not an order, reservation, or guarantee of inventory.\n\nWe'll email you when Drop 01 gets closer to release. You can reply to opt out of future drop updates.\n\nBuilt. Ridden. Repeat.\nDualBore Media`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>DualBore Media Drop 01</title></head><body style="margin:0;background:#0b0d10;color:#f1f5f9;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#13161c;border:1px solid #232834"><tr><td style="padding:32px;font-size:16px;line-height:1.7"><p style="color:#00f0ff;font-size:12px;letter-spacing:2px">DUALBORE MEDIA / DROP 01</p><h1 style="font-size:28px;line-height:1.2">You're on the list.</h1><p>Hi ${escapeHtml(name)},</p><p>You're on the DualBore Media Drop 01 list.</p><p>We saved your interest in:<br><strong>Design:</strong> ${escapeHtml(style)}<br><strong>Size:</strong> ${escapeHtml(size)}</p><p>This is only a drop notification list. It is not an order, reservation, or guarantee of inventory.</p><p>We'll email you when Drop 01 gets closer to release. You can reply to opt out of future drop updates.</p><p>Built. Ridden. Repeat.<br>DualBore Media</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}

function validSender(value) {
  if (typeof value !== 'string' || /[\r\n]/.test(value)) return false;
  const address = value.match(/^[^<>]+<([^<>]+)>$/)?.[1] || value;
  return isEmail(address.trim());
}

export function emailMessages(submission, settings) {
  const message = confirmationMessage(submission);
  const base = { from: settings.from, ...(settings.replyTo ? { reply_to: settings.replyTo } : {}) };
  const messages = [{ kind: 'confirmation', body: { ...base, to: [submission.email], ...message } }];
  if (settings.notifyTo) {
    messages.push({ kind: 'internal', body: { ...base, to: [settings.notifyTo], subject: 'New DualBore Media Drop 01 signup',
      text: `A signup was accepted by Netlify Forms.\n\nName: ${submission.name}\nEmail: ${submission.email}\nDesign: ${submission.style}\nSize: ${submission.size}\n\nThis is interest only, not an order.`,
      html: `<html lang="en"><body><h1>New Drop 01 signup</h1><p>Name: ${escapeHtml(submission.name)}<br>Email: ${escapeHtml(submission.email)}<br>Design: ${escapeHtml(submission.style)}<br>Size: ${escapeHtml(submission.size)}</p><p>Interest only, not an order.</p></body></html>` } });
  }
  return messages;
}

async function sendEmail(body, key, { request, pause, log }) {
  // Resend deduplicates this exact logical message for 24 hours. Never log this key.
  const idempotencyKey = 'drop01-v1-' + createHash('sha256').update(JSON.stringify(body)).digest('hex');
  for (let attempt = 0; attempt < 3; attempt++) {
    let retry = true;
    try {
      const response = await request('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
      });
      if (response.ok) {
        const result = await response.json();
        if (typeof result.id === 'string' && result.id) return;
      } else {
        retry = response.status === 429 || response.status >= 500;
        log('resend_request_failed', { status: response.status, attempt: attempt + 1 });
      }
    } catch {
      log('resend_network_failure', { attempt: attempt + 1 });
    }
    if (!retry || attempt === 2) throw new Error('Drop confirmation email could not be sent');
    await pause(1000 * 2 ** attempt);
  }
}

export async function processSubmission(event, {
  env = key => Netlify.env.get(key), request = fetch, pause = sleep,
  log = (code, details = {}) => console.warn('[drop-waitlist-email]', code, details),
} = {}) {
  const submission = validateSubmission(event);
  const production=env('COMMERCE_ENVIRONMENT')==='production';
  if(production&&env('DROP_WAITLIST_ENABLED')!=='true')return {status:'disabled'};
  if (submission.status !== 'valid') {
    if (submission.status === 'invalid') log('invalid_submission');
    return { status: submission.status };
  }
  if(env('DATABASE_URL')&&production)try{
    const {commerceRuntime}=await import('../commerce/runtime.mjs');const {recordMarketingConsent}=await import('../operations/marketing.mjs');
    const settings=Object.fromEntries(['DATABASE_URL','SITE_ORIGIN','COMMERCE_ENVIRONMENT','PAYMENTS_ENABLED','TRANSACTIONAL_EMAILS_ENABLED'].map(key=>[key,env(key)]));
    const {repository}=await commerceRuntime(settings);await repository.transaction(s=>recordMarketingConsent(s,{email:submission.email,consent:true,source:'drop-waitlist',policyVersion:'prelaunch-v1'}));
  }catch{log('consent_persistence_unavailable');}
  if(production&&env('MARKETING_EMAILS_ENABLED')!=='true')return {status:'recorded'};
  const key = env('RESEND_API_KEY');
  const settings = { from: env('RESEND_FROM'), replyTo: env('RESEND_REPLY_TO'), notifyTo: env('RESEND_NOTIFY_TO') };
  const missing = ['RESEND_API_KEY', 'RESEND_FROM'].filter(name => !env(name));
  if (missing.length) { log('configuration_missing', { variables: missing }); return { status: 'unconfigured' }; }
  if (!/^re_[a-z0-9_-]+$/i.test(key) || !validSender(settings.from)
    || (settings.replyTo && !isEmail(settings.replyTo)) || (settings.notifyTo && !isEmail(settings.notifyTo))) {
    log('configuration_invalid');
    return { status: 'unconfigured' };
  }
  for (const message of emailMessages(submission, settings)) {
    await sendEmail(message.body, key, { request, pause, log });
    log('email_accepted', { kind: message.kind });
  }
  return { status: 'sent' };
}
