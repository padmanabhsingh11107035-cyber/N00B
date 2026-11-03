// The Grievance Officer's page: sends a complaint (no login needed) and looks a ticket up. Talks only to NOOB's own database through two public functions
// (submit_grievance, track_grievance; see supabase/migrations/20261103000001_grievances.sql). The key below is the public, publishable key every NOOB page already carries.
(function () {
  var URL_ = 'https://abffssydapumuhwgzeck.supabase.co';
  var KEY = 'sb_publishable_g20GG46EXeMr1jcNwVJtmw_rAZKsuA3';
  function rpc(name, body) {
    return fetch(URL_ + '/rest/v1/rpc/' + name, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j && j.message || 'Could not reach NOOB. Please try again.'); return j; }); });
  }
  function $(id) { return document.getElementById(id); }
  function say(el, text, bad) { el.textContent = text; el.className = 'msg ' + (bad ? 'bad' : 'good'); el.hidden = false; }
  function when(s) { try { return new Date(s).toLocaleString(); } catch (e) { return s; } }

  var form = $('gform'), out = $('gout');
  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = form.querySelector('button[type=submit]'); btn.disabled = true; out.hidden = true;
    rpc('submit_grievance', { p_name: form.name.value, p_contact: form.contact.value, p_username: form.username.value, p_topic: form.topic.value, p_message: form.message.value })
      .then(function (r) {
        if (r && r.success) { say(out, 'Received. Your ticket number is ' + r.ticket + '. Keep it: with the contact you gave it shows where your complaint is. We acknowledge within ' + r.acknowledgeWithin + ' and resolve within ' + r.resolveWithin + '.', false); form.reset(); }
        else say(out, (r && r.error) || 'Could not send. Please try again.', true);
      })
      .catch(function (err) { say(out, err.message, true); })
      .then(function () { btn.disabled = false; });
  });
  var tform = $('tform'), tout = $('tout');
  if (tform) tform.addEventListener('submit', function (e) {
    e.preventDefault(); tout.hidden = true;
    rpc('track_grievance', { p_ticket: tform.ticket.value, p_contact: tform.tcontact.value })
      .then(function (r) {
        if (!r || !r.found) return say(tout, 'No complaint matches that ticket number and contact.', true);
        var s = 'Ticket ' + r.ticket + ': ' + r.status + '. Filed ' + when(r.filedAt) + '.';
        if (r.acknowledgedAt) s += ' Acknowledged ' + when(r.acknowledgedAt) + '.'; else s += ' To be acknowledged by ' + when(r.acknowledgeBy) + '.';
        if (r.resolvedAt) s += ' Closed ' + when(r.resolvedAt) + '.'; else s += ' To be resolved by ' + when(r.resolveBy) + '.';
        if (r.resolution) s += ' Answer: ' + r.resolution;
        say(tout, s, false);
      })
      .catch(function (err) { say(tout, err.message, true); });
  });
})();
