// Smart Budget - OAuth sign-in and approval page.
// Fill in the two values below (see the setup steps).
// The publishable key is designed to be public.
// NEVER put a secret key or a service_role key in this file.
const SUPABASE_URL = 'https://zhxtgqkqnezamhfhlmoc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_0elIvuNtvQ-IyevZwQ8msg_lwl9Hhfx';

(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var VIEWS = ['message', 'login', 'consent'];

  function show(name) {
    VIEWS.forEach(function (v) { $(v).hidden = v !== name; });
  }
  function say(text, isError) {
    $('messageText').textContent = text;
    $('messageText').className = isError ? 'error' : '';
    show('message');
  }

  // Clickjacking protection: never run inside another page.
  if (window.top !== window.self) {
    document.body.textContent = 'This page cannot be shown inside another page.';
    return;
  }

  if (SUPABASE_URL.indexOf('YOUR-PROJECT-REF') !== -1 ||
      SUPABASE_PUBLISHABLE_KEY.indexOf('YOUR-PUBLISHABLE-KEY') !== -1) {
    say('Setup incomplete: the project address and publishable key have not been filled in yet.', true);
    return;
  }
  if (!window.supabase || !window.supabase.createClient) {
    say('Could not load the sign-in library. Check your connection and reload.', true);
    return;
  }

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  var authorizationId = new URLSearchParams(window.location.search).get('authorization_id');
  if (authorizationId && authorizationId.length > 300) authorizationId = null;

  function go(url) {
    var u;
    try { u = new URL(url); } catch (e) { say('Received an invalid return address.', true); return; }
    var local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) {
      say('Received an unsafe return address, so nothing was done.', true);
      return;
    }
    say('Returning to Claude…');
    window.location.assign(u.href);
  }

  function setBusy(busy) {
    ['approveBtn', 'denyBtn', 'signInBtn', 'signUpBtn'].forEach(function (id) { $(id).disabled = busy; });
  }
  function loginMsg(text, isError) {
    $('loginMsg').textContent = text;
    $('loginMsg').className = isError ? 'error' : '';
  }

  async function loadDetails() {
    say('Checking the request…');
    var res = await client.auth.oauth.getAuthorizationDetails(authorizationId);
    var data = res.data;
    if (res.error || !data) {
      say('This request is invalid or has expired. Go back to Claude and try connecting again.' +
          (res.error && res.error.message ? ' (' + res.error.message + ')' : ''), true);
      return;
    }
    // Already approved before: Supabase tells us where to send the user.
    if (!data.authorization_id && data.redirect_url) { go(data.redirect_url); return; }

    var s = await client.auth.getSession();
    var email = (data.user && data.user.email) || (s.data.session && s.data.session.user.email) || '';
    var clientName = (data.client && data.client.name) || 'An app';
    var scope = Array.isArray(data.scope) ? data.scope.join(', ') : (data.scope || 'Basic account access');
    var returnTo = '';
    if (data.redirect_uri) {
      try { returnTo = new URL(data.redirect_uri).host; } catch (e) { returnTo = ''; }
    }
    $('consentTitle').textContent = 'Allow ' + clientName + '?';
    $('who').textContent = email;
    $('scopes').textContent = scope;
    $('returnTo').textContent = returnTo || 'The app that asked';
    setBusy(false);
    show('consent');
  }

  async function decide(approve) {
    setBusy(true);
    var res = approve
      ? await client.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await client.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
    if (res.error || !res.data) {
      setBusy(false);
      say('Something went wrong: ' + ((res.error && res.error.message) || 'no response') +
          '. Go back to Claude and try connecting again.', true);
      return;
    }
    var target = res.data.redirect_url || res.data.redirect_to;
    if (!target) {
      say('Done. You can close this tab and go back to Claude.');
      return;
    }
    go(target);
  }

  async function signIn() {
    var email = $('email').value.trim();
    var password = $('password').value;
    if (!email || !password) { loginMsg('Enter your email and password.', true); return; }
    setBusy(true); loginMsg('Signing in…', false);
    var res = await client.auth.signInWithPassword({ email: email, password: password });
    if (res.error) { setBusy(false); loginMsg(res.error.message, true); return; }
    $('password').value = '';
    loginMsg('', false);
    await loadDetails();
  }

  async function signUp() {
    var email = $('email').value.trim();
    var password = $('password').value;
    if (!email || password.length < 8) {
      loginMsg('Enter your email and a password of at least 8 characters.', true);
      return;
    }
    setBusy(true); loginMsg('Creating your account…', false);
    var res = await client.auth.signUp({
      email: email,
      password: password,
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });
    setBusy(false);
    if (res.error) { loginMsg(res.error.message, true); return; }
    $('password').value = '';
    if (res.data && res.data.session) { loginMsg('', false); await loadDetails(); return; }
    loginMsg('Check your email to confirm your account, then go back to Claude and connect again.', false);
  }

  $('loginForm').addEventListener('submit', function (e) { e.preventDefault(); signIn(); });
  $('signUpBtn').addEventListener('click', function () { signUp(); });
  $('approveBtn').addEventListener('click', function () { decide(true); });
  $('denyBtn').addEventListener('click', function () { decide(false); });
  $('signOutBtn').addEventListener('click', async function () {
    await client.auth.signOut();
    loginMsg('', false);
    setBusy(false);
    show('login');
  });

  async function start() {
    var s = await client.auth.getSession();
    var session = s.data && s.data.session;
    if (!authorizationId) {
      say(session
        ? 'You are signed in. Go back to Claude and connect Smart Budget.'
        : 'Nothing to approve here. Start by adding Smart Budget as a connector in Claude.');
      return;
    }
    if (!session) { setBusy(false); show('login'); return; }
    await loadDetails();
  }

  start().catch(function (e) {
    say('Unexpected error: ' + (e && e.message ? e.message : e), true);
  });
})();
