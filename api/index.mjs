import { neon } from "@neondatabase/serverless";
import { randomBytes, randomUUID } from "node:crypto";
import {
  hash,
  passwordHash,
  verifyPassword,
  validPassword,
  safeAccount,
  clean,
} from "../server/security.mjs";
const fail = (status, message) => Object.assign(new Error(message), { status });
const uuid = (x) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x);
const safeUrl = (x) => {
  const value = clean(x, 500);
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
};
const safeImage = (x) => {
  const value = typeof x === "string" ? x : "";
  return /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value) &&
    value.length < 1800000
    ? value
    : "";
};
const safeFile = (x) => {
  const value = typeof x === "string" ? x : "";
  return /^data:(?:image\/(?:png|jpeg|webp)|application\/pdf);base64,[a-z0-9+/=]+$/i.test(
    value,
  ) && value.length < 4500000
    ? value
    : "";
};
const roleCheck = (a, ...roles) => {
  if (!roles.includes(a.role))
    throw fail(403, "Cet espace ne correspond pas à votre compte.");
};
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  try {
    if (!process.env.DATABASE_URL)
      throw fail(503, "Le service est momentanément indisponible.");
    const sql = neon(process.env.DATABASE_URL);
    const action =
      req.query?.action ||
      new URL(req.url, "https://amelib.vercel.app").searchParams.get("action");
    const b = req.body && typeof req.body === "object" ? req.body : {};
    if (!["GET", "POST"].includes(req.method))
      throw fail(405, "Méthode non autorisée.");
    if (req.method === "POST") {
      const origin = req.headers.origin;
      const expected = "https://" + req.headers.host;
      if (
        origin !== expected &&
        !(
          process.env.NODE_ENV !== "production" &&
          origin === "http://" + req.headers.host
        )
      )
        throw fail(403, "Origine de la requête non autorisée.");
      if (
        !String(req.headers["content-type"] || "").includes("application/json")
      )
        throw fail(415, "Format non autorisé.");
    }
    const send = (data) => res.status(200).json(data);
    const limit = async (key, max) => {
      const rows =
        await sql`INSERT INTO rate_limits(key,count,expires_at) VALUES(${key},1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.count+1 END,expires_at=CASE WHEN rate_limits.expires_at<now() THEN now()+interval '15 minutes' ELSE rate_limits.expires_at END RETURNING count`;
      if (rows[0].count > max)
        throw fail(429, "Trop de tentatives. Réessayez dans 15 minutes.");
    };
    const cookie = (token, age = 604800) =>
      res.setHeader(
        "Set-Cookie",
        `amelib_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${age}`,
      );
    const session = async (account) => {
      const token = randomBytes(32).toString("hex");
      await sql`INSERT INTO sessions(token_hash,account_id,expires_at) VALUES(${hash(token)},${account.id},now()+interval '7 days')`;
      cookie(token);
    };
    if (["signup", "login", "recover"].includes(action)) {
      if (req.method !== "POST") throw fail(405, "Requête POST nécessaire.");
      const ip = String(
        req.headers["x-vercel-forwarded-for"] ||
          req.headers["x-forwarded-for"] ||
          "unknown",
      ).split(",")[0];
      await limit("auth-ip:" + hash(ip), 30);
      const email = clean(b.email, 254).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw fail(400, "Indiquez un e-mail valide.");
      await limit("auth-email:" + hash(email), 12);
      if (action === "signup") {
        const name = clean(b.name, 80);
        if (!name || !validPassword(b.password))
          throw fail(
            400,
            "Indiquez un nom et un mot de passe de 12 à 128 caractères.",
          );
        if (!["patient", "professional", "worker"].includes(b.role))
          throw fail(400, "Type de compte non autorisé.");
        const id = randomUUID(),
          password = await passwordHash(b.password),
          recovery = randomBytes(24).toString("hex");
        const account = { id, email, name, role: b.role };
        await sql.transaction([
          sql`INSERT INTO accounts(id,email,name,role,password_hash,recovery_hash) VALUES(${id},${email},${name},${b.role},${password},${hash(recovery)})`,
          sql`INSERT INTO profiles(account_id) VALUES(${id})`,
        ]);
        await session(account);
        return send({ account, recoveryCode: recovery });
      }
      const [account] = await sql`SELECT * FROM accounts WHERE email=${email}`;
      if (account?.suspended)
        throw fail(403, "Ce compte est suspendu. Contactez l’administration.");
      if (action === "recover") {
        if (!validPassword(b.password))
          throw fail(400, "Choisissez un mot de passe de 12 à 128 caractères.");
        if (
          !account ||
          hash(clean(b.recoveryCode, 100)) !== account.recovery_hash
        )
          throw fail(401, "E-mail ou code de récupération incorrect.");
        const password = await passwordHash(b.password),
          recovery = randomBytes(24).toString("hex");
        await sql.transaction([
          sql`UPDATE accounts SET password_hash=${password},recovery_hash=${hash(recovery)} WHERE id=${account.id}`,
          sql`DELETE FROM sessions WHERE account_id=${account.id}`,
        ]);
        await session(account);
        return send({ account: safeAccount(account), recoveryCode: recovery });
      }
      const dummy = "00000000000000000000000000000000:" + "00".repeat(64);
      const valid = await verifyPassword(
        typeof b.password === "string" ? b.password.slice(0, 128) : "",
        account?.password_hash || dummy,
      );
      if (!account || !valid)
        throw fail(401, "E-mail ou mot de passe incorrect.");
      if (b.role && account.role !== b.role)
        throw fail(
          403,
          "Ce compte appartient à un autre espace. Utilisez la connexion adaptée.",
        );
      await session(account);
      return send({ account: safeAccount(account) });
    }
    if (action === "directory" && req.method === "GET") {
      const rows =
        await sql`SELECT a.id,a.name,a.role,p.specialty,p.city,p.address,p.bio,p.phone,p.languages,p.qualifications,p.price,p.verified,p.headline,p.contact_email,p.website,p.booking_url,p.calendar_provider,p.photo_data,p.logo_data,(SELECT min(starts_at) FROM slots WHERE professional_id=a.id AND available AND starts_at>now()) AS next_slot,(SELECT coalesce(json_agg(json_build_object('id',s.id,'name',s.name,'description',s.description,'duration',s.duration,'price',s.price,'vat',s.vat) ORDER BY s.created_at),'[]'::json) FROM services s WHERE s.owner_id=a.id AND s.active) AS services FROM accounts a JOIN profiles p ON a.id=p.account_id WHERE p.published AND NOT a.suspended AND a.role='professional' ORDER BY a.name LIMIT 200`;
      return send({ professionals: rows });
    }
    if (action === "public-settings" && req.method === "GET") {
      const [settings] =
        await sql`SELECT name,support_email,announcement FROM platform_settings WHERE id=1`;
      return send({ settings });
    }
    if (action === "slots" && req.method === "GET") {
      const id = req.query.professional;
      if (!uuid(id)) throw fail(400, "Profil invalide.");
      const rows =
        await sql`SELECT s.id,s.starts_at,s.duration FROM slots s JOIN profiles p ON p.account_id=s.professional_id WHERE s.professional_id=${id} AND s.available AND s.starts_at>now() AND p.published AND EXISTS(SELECT 1 FROM accounts WHERE id=s.professional_id AND NOT suspended) ORDER BY s.starts_at LIMIT 200`;
      return send({ slots: rows });
    }
    const token =
      (req.headers.cookie || "")
        .split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith("amelib_session="))
        ?.slice(15) || "";
    const [account] = token
      ? await sql`SELECT a.* FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=${hash(token)} AND s.expires_at>now() AND NOT a.suspended`
      : [];
    if (action === "session" && req.method === "GET")
      return send({ account: account ? safeAccount(account) : null });
    if (!account)
      throw fail(401, "Connectez-vous pour accéder à votre espace.");
    const [membership] = ["professional", "worker"].includes(account.role)
      ? await sql`SELECT owner_id,permissions FROM clinic_members WHERE member_id=${account.id} AND active ORDER BY created_at DESC LIMIT 1`
      : [];
    const workspaceId = membership?.owner_id || account.id;
    const can = (permission) =>
      !membership ||
      (Array.isArray(membership.permissions) &&
        membership.permissions.includes(permission));
    const permissionByAction = {
      "slot-create": "agenda",
      "slot-delete": "agenda",
      complete: "agenda",
      "patient-record-save": "clinical",
      "dental-media-add": "clinical",
      "visit-note-save": "clinical",
      "service-save": "billing",
      "service-toggle": "billing",
      "document-create": "billing",
      "document-send": "billing",
      "document-status": "billing",
      "document-update": "billing",
      "ledger-create": "billing",
      "ledger-paid": "billing",
      "task-save": "tasks",
      "task-stage": "tasks",
      "mission-save": "tasks",
      "mission-status": "tasks",
      "message-send": "messages",
    };
    if (permissionByAction[action] && !can(permissionByAction[action]))
      throw fail(403, "Votre rôle dans le cabinet ne permet pas cette action.");
    if (req.method === "POST") await limit("write:" + account.id, 150);
    if (action === "logout" && req.method === "POST") {
      await sql`DELETE FROM sessions WHERE token_hash=${hash(token)}`;
      cookie("", 0);
      return send({ ok: true });
    }
    if (action === "dashboard" && req.method === "GET") {
      const [profile] =
        await sql`SELECT * FROM profiles WHERE account_id=${workspaceId}`;
      const appointments =
        await sql`SELECT ap.id,ap.slot_id,ap.reason,ap.status,ap.patient_id,ap.professional_id,s.starts_at,s.duration,pa.name AS patient_name,pr.name AS professional_name,p.address FROM appointments ap JOIN slots s ON s.id=ap.slot_id JOIN accounts pa ON pa.id=ap.patient_id JOIN accounts pr ON pr.id=ap.professional_id JOIN profiles p ON p.account_id=pr.id WHERE ap.patient_id=${workspaceId} OR ap.professional_id=${workspaceId} ORDER BY s.starts_at DESC LIMIT 300`;
      const slots =
        account.role === "patient"
          ? []
          : await sql`SELECT * FROM slots WHERE professional_id=${workspaceId} AND starts_at>now() ORDER BY starts_at LIMIT 300`;
      const ledger =
        account.role === "patient"
          ? []
          : await sql`SELECT * FROM ledger WHERE owner_id=${workspaceId} ORDER BY created_at DESC LIMIT 500`;
      const professional = ["professional", "worker", "admin"].includes(
        account.role,
      );
      const [patients, services, documents, tasks, missions, members] =
        professional
          ? await Promise.all([
              sql`SELECT pa.id AS patient_id,pa.name,pa.email,coalesce(r.id::text,'') AS record_id,coalesce(r.phone,'') AS phone,coalesce(r.status,'actif') AS record_status,coalesce(r.tags,'') AS tags,coalesce(r.notes,'') AS notes,r.birth_date,r.address,r.social_security_number,r.mutual_provider,r.mutual_member_number,r.insurance_card_data,r.insurance_card_name,r.billing_document_data,r.billing_document_name,r.medical_alerts,r.allergies,r.medications,coalesce(r.dental_chart,'{}'::jsonb) AS dental_chart,max(s.starts_at) AS last_appointment,count(ap.id)::int AS appointment_count,(SELECT coalesce(json_agg(dm ORDER BY dm.created_at DESC),'[]'::json) FROM dental_media dm WHERE dm.owner_id=${workspaceId} AND dm.patient_id=pa.id) AS media,(SELECT coalesce(json_agg(vn ORDER BY vn.created_at DESC),'[]'::json) FROM visit_notes vn WHERE vn.owner_id=${workspaceId} AND vn.patient_id=pa.id) AS visits FROM appointments ap JOIN accounts pa ON pa.id=ap.patient_id JOIN slots s ON s.id=ap.slot_id LEFT JOIN patient_records r ON r.owner_id=${workspaceId} AND r.patient_id=pa.id WHERE ap.professional_id=${workspaceId} GROUP BY pa.id,pa.name,pa.email,r.id ORDER BY max(s.starts_at) DESC`,
              sql`SELECT * FROM services WHERE owner_id=${workspaceId} ORDER BY active DESC,created_at DESC`,
              sql`SELECT d.*,pa.name AS patient_name,pa.email AS patient_email FROM business_documents d JOIN accounts pa ON pa.id=d.patient_id WHERE d.owner_id=${workspaceId} ORDER BY d.created_at DESC LIMIT 500`,
              sql`SELECT t.*,pa.name AS patient_name FROM tasks t LEFT JOIN accounts pa ON pa.id=t.patient_id WHERE t.owner_id=${workspaceId} ORDER BY CASE t.stage WHEN 'À faire' THEN 1 WHEN 'En cours' THEN 2 WHEN 'En attente' THEN 3 ELSE 4 END,t.due_at NULLS LAST,t.created_at DESC LIMIT 500`,
              sql`SELECT * FROM missions WHERE owner_id=${workspaceId} ORDER BY CASE status WHEN 'en_route' THEN 1 WHEN 'nearby' THEN 2 WHEN 'arrived' THEN 3 WHEN 'planned' THEN 4 ELSE 5 END,updated_at DESC LIMIT 200`,
              sql`SELECT cm.id,cm.member_id,cm.job_title,cm.permissions,cm.active,a.name,a.email,a.role FROM clinic_members cm JOIN accounts a ON a.id=cm.member_id WHERE cm.owner_id=${workspaceId} ORDER BY cm.created_at DESC`,
            ])
          : [[], [], [], [], [], []];
      return send({
        account: safeAccount(account),
        profile,
        appointments:
          !membership || can("agenda") || can("messages") || can("clinical")
            ? appointments
            : [],
        slots: can("agenda") ? slots : [],
        ledger: can("billing") ? ledger : [],
        patients:
          !membership || can("patients_admin") || can("clinical")
            ? patients
            : [],
        services: can("billing") ? services : [],
        documents: can("billing") ? documents : [],
        tasks: can("tasks") ? tasks : [],
        missions: can("tasks") ? missions : [],
        members: membership ? [] : members,
      });
    }
    if (action === "profile" && req.method === "POST") {
      if (membership)
        throw fail(
          403,
          "Seul le propriétaire du cabinet peut modifier ce profil.",
        );
      const name = clean(b.name, 80);
      if (!name) throw fail(400, "Le nom est obligatoire.");
      const professional = ["professional", "worker", "admin"].includes(
        account.role,
      );
      const specialty = clean(b.specialty, 100),
        city = clean(b.city, 100),
        address = clean(b.address, 250),
        price = Number(b.price || 0),
        identifier = clean(b.identifier, 50);
      if (!Number.isFinite(price) || price < 0 || price > 100000)
        throw fail(400, "Tarif invalide.");
      if (
        professional &&
        b.published &&
        (!specialty || !city || !address || !identifier)
      )
        throw fail(
          400,
          "Renseignez la profession, la ville, l’adresse et l’identifiant professionnel avant publication.",
        );
      const photo = b.photo_data === undefined ? null : safeImage(b.photo_data),
        logo = b.logo_data === undefined ? null : safeImage(b.logo_data);
      if ((b.photo_data && photo === "") || (b.logo_data && logo === ""))
        throw fail(
          400,
          "Utilisez une image JPG, PNG ou WebP de moins de 1,3 Mo.",
        );
      const hours =
        b.weekly_hours && typeof b.weekly_hours === "object"
          ? b.weekly_hours
          : {};
      await sql.transaction([
        sql`UPDATE accounts SET name=${name} WHERE id=${workspaceId}`,
        sql`UPDATE profiles SET specialty=${specialty},city=${city},address=${address},bio=${clean(b.bio, 3000)},phone=${clean(b.phone, 30)},languages=${clean(b.languages, 200)},qualifications=${clean(b.qualifications, 1500)},identifier=${identifier},price=${price},headline=${clean(b.headline, 180)},contact_email=${clean(b.contact_email, 254).toLowerCase()},website=${safeUrl(b.website)},booking_url=${safeUrl(b.booking_url)},calendar_provider=${clean(b.calendar_provider, 40)},clinic_name=${clean(b.clinic_name, 120)},weekly_hours=${JSON.stringify(hours)}::jsonb,photo_data=coalesce(${photo},photo_data),logo_data=coalesce(${logo},logo_data),published=${account.role === "professional" && !!b.published},verified=CASE WHEN identifier<>${identifier} THEN false ELSE verified END WHERE account_id=${workspaceId}`,
      ]);
      return send({ ok: true });
    }
    if (action === "slot-create" && req.method === "POST") {
      roleCheck(account, "professional", "worker", "admin");
      const start = new Date(b.starts_at),
        duration = Number(b.duration);
      if (
        !Number.isFinite(start.getTime()) ||
        start <= new Date() ||
        start > new Date(Date.now() + 180 * 86400000) ||
        !Number.isInteger(duration) ||
        duration < 15 ||
        duration > 180
      )
        throw fail(
          400,
          "Choisissez un créneau futur de 15 à 180 minutes, dans les six prochains mois.",
        );
      const id = randomUUID();
      const [result] = await sql
        .transaction([
          sql`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`,
          sql`INSERT INTO slots(id,professional_id,starts_at,duration) SELECT ${id},${workspaceId},${start.toISOString()}::timestamptz,${duration} WHERE NOT EXISTS(SELECT 1 FROM slots WHERE professional_id=${workspaceId} AND tstzrange(starts_at, starts_at+duration*interval '1 minute','[)') && tstzrange(${start.toISOString()}::timestamptz,${start.toISOString()}::timestamptz+${duration}*interval '1 minute','[)')) RETURNING id`,
        ])
        .then((r) => [r[1]]);
      if (!result.length)
        throw fail(409, "Ce créneau chevauche un horaire existant.");
      return send({ id });
    }
    if (action === "slot-delete" && req.method === "POST") {
      roleCheck(account, "professional", "worker", "admin");
      if (!uuid(b.id)) throw fail(400, "Créneau invalide.");
      const rows =
        await sql`DELETE FROM slots s WHERE id=${b.id} AND professional_id=${workspaceId} AND NOT EXISTS(SELECT 1 FROM appointments WHERE slot_id=s.id) RETURNING id`;
      if (!rows.length)
        throw fail(409, "Ce créneau est réservé ou indisponible.");
      return send({ ok: true });
    }
    if (action === "book" && req.method === "POST") {
      roleCheck(account, "patient");
      if (!uuid(b.slot_id) || !clean(b.reason, 150))
        throw fail(400, "Choisissez un créneau et un motif.");
      const id = randomUUID();
      const rows =
        await sql`WITH chosen AS (UPDATE slots s SET available=false FROM profiles p WHERE s.id=${b.slot_id} AND s.professional_id=p.account_id AND p.published AND s.available AND s.starts_at>now() AND EXISTS(SELECT 1 FROM accounts WHERE id=s.professional_id AND NOT suspended) RETURNING s.id,s.professional_id) INSERT INTO appointments(id,slot_id,patient_id,professional_id,reason) SELECT ${id},id,${workspaceId},professional_id,${clean(b.reason, 150)} FROM chosen RETURNING id`;
      if (!rows.length)
        throw fail(
          409,
          "Ce créneau n’est plus disponible. Choisissez un autre horaire.",
        );
      return send({ id });
    }
    if (action === "cancel" && req.method === "POST") {
      if (!uuid(b.id)) throw fail(400, "Rendez-vous invalide.");
      const rows =
        await sql`WITH cancelled AS (UPDATE appointments ap SET status='cancelled' FROM slots s WHERE ap.id=${b.id} AND s.id=ap.slot_id AND s.starts_at>now() AND ap.status='confirmed' AND (ap.patient_id=${workspaceId} OR ap.professional_id=${workspaceId}) RETURNING ap.slot_id) UPDATE slots SET available=true WHERE id IN(SELECT slot_id FROM cancelled) RETURNING id`;
      if (!rows.length)
        throw fail(403, "Ce rendez-vous ne peut pas être annulé.");
      return send({ ok: true });
    }
    if (action === "complete" && req.method === "POST") {
      roleCheck(account, "professional", "worker", "admin");
      if (!uuid(b.id)) throw fail(400, "Rendez-vous invalide.");
      const rows =
        await sql`UPDATE appointments ap SET status='completed' FROM slots s WHERE ap.id=${b.id} AND ap.slot_id=s.id AND s.starts_at<=now() AND ap.professional_id=${workspaceId} AND ap.status='confirmed' RETURNING ap.id`;
      if (!rows.length)
        throw fail(
          403,
          "Vous pouvez clôturer uniquement une consultation commencée de votre agenda.",
        );
      return send({ ok: true });
    }
    if (["messages", "message-send"].includes(action)) {
      const id =
        req.method === "GET" ? req.query.appointment : b.appointment_id;
      if (!uuid(id)) throw fail(400, "Conversation invalide.");
      const [ap] =
        await sql`SELECT id FROM appointments WHERE id=${id} AND (patient_id=${workspaceId} OR professional_id=${workspaceId})`;
      if (!ap) throw fail(403, "Vous n’avez pas accès à cette conversation.");
      if (action === "message-send" && req.method === "POST") {
        const body = clean(b.body, 2000);
        if (!body) throw fail(400, "Écrivez un message.");
        await sql`INSERT INTO messages(id,appointment_id,sender_id,body) VALUES(${randomUUID()},${id},${account.id},${body})`;
        return send({ ok: true });
      }
      if (action === "messages" && req.method === "GET") {
        const rows =
          await sql`SELECT m.id,m.body,m.sender_id,m.created_at,m.document_id,a.name,d.doc_type,d.number,d.total,d.items,d.note,d.issue_date,d.due_date,pa.name AS patient_name FROM messages m JOIN accounts a ON a.id=m.sender_id LEFT JOIN business_documents d ON d.id=m.document_id LEFT JOIN accounts pa ON pa.id=d.patient_id WHERE m.appointment_id=${id} ORDER BY m.created_at LIMIT 500`;
        return send({ messages: rows });
      }
    }
    if (action === "ledger-create" && req.method === "POST") {
      roleCheck(account, "professional", "worker", "admin");
      const amount = Number(b.amount),
        label = clean(b.label, 200);
      if (
        !label ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        amount > 1000000 ||
        !["income", "expense"].includes(b.kind)
      )
        throw fail(400, "Vérifiez le libellé, le type et le montant.");
      await sql`INSERT INTO ledger(id,owner_id,label,amount,kind,paid) VALUES(${randomUUID()},${workspaceId},${label},${amount},${b.kind},${!!b.paid})`;
      return send({ ok: true });
    }
    if (action === "ledger-paid" && req.method === "POST") {
      roleCheck(account, "professional", "worker", "admin");
      if (!uuid(b.id)) throw fail(400, "Opération invalide.");
      const rows =
        await sql`UPDATE ledger SET paid=true WHERE id=${b.id} AND owner_id=${workspaceId} RETURNING id`;
      if (!rows.length) throw fail(404, "Opération introuvable.");
      return send({ ok: true });
    }

    if (action === "patient-record-save" && req.method === "POST") {
      roleCheck(account, "professional", "worker", "admin");
      if (!uuid(b.patient_id)) throw fail(400, "Patient invalide.");
      const [linked] =
        await sql`SELECT 1 FROM appointments WHERE professional_id=${workspaceId} AND patient_id=${b.patient_id} LIMIT 1`;
      if (!linked)
        throw fail(403, "Ce patient ne fait pas partie de votre patientèle.");
      const [existing] =
        await sql`SELECT insurance_card_data,billing_document_data FROM patient_records WHERE owner_id=${workspaceId} AND patient_id=${b.patient_id}`;
      const insurance = b.insurance_card_data
        ? safeFile(b.insurance_card_data)
        : existing?.insurance_card_data || "";
      const billing = b.billing_document_data
        ? safeFile(b.billing_document_data)
        : existing?.billing_document_data || "";
      if (!insurance || !billing)
        throw fail(
          400,
          "La carte de mutuelle et une facture sont obligatoires pour créer la fiche patient.",
        );
      const chart =
        b.dental_chart && typeof b.dental_chart === "object"
          ? b.dental_chart
          : {};
      await sql`INSERT INTO patient_records(id,owner_id,patient_id,status,phone,email,tags,notes,birth_date,address,social_security_number,mutual_provider,mutual_member_number,insurance_card_data,insurance_card_name,billing_document_data,billing_document_name,medical_alerts,allergies,medications,dental_chart) VALUES(${randomUUID()},${workspaceId},${b.patient_id},${clean(b.status, 30) || "actif"},${clean(b.phone, 40)},${clean(b.email, 254)},${clean(b.tags, 500)},${clean(b.notes, 8000)},${b.birth_date || null},${clean(b.address, 300)},${clean(b.social_security_number, 30)},${clean(b.mutual_provider, 120)},${clean(b.mutual_member_number, 80)},${insurance},${clean(b.insurance_card_name, 180)},${billing},${clean(b.billing_document_name, 180)},${clean(b.medical_alerts, 2000)},${clean(b.allergies, 1000)},${clean(b.medications, 1500)},${JSON.stringify(chart)}::jsonb) ON CONFLICT(owner_id,patient_id) DO UPDATE SET status=excluded.status,phone=excluded.phone,email=excluded.email,tags=excluded.tags,notes=excluded.notes,birth_date=excluded.birth_date,address=excluded.address,social_security_number=excluded.social_security_number,mutual_provider=excluded.mutual_provider,mutual_member_number=excluded.mutual_member_number,insurance_card_data=excluded.insurance_card_data,insurance_card_name=excluded.insurance_card_name,billing_document_data=excluded.billing_document_data,billing_document_name=excluded.billing_document_name,medical_alerts=excluded.medical_alerts,allergies=excluded.allergies,medications=excluded.medications,dental_chart=excluded.dental_chart,updated_at=now()`;
      return send({ ok: true });
    }
    if (action === "dental-media-add" && req.method === "POST") {
      roleCheck(account, "professional", "worker", "admin");
      if (
        !uuid(b.patient_id) ||
        !["photo", "xray", "document"].includes(b.kind)
      )
        throw fail(400, "Média invalide.");
      const data = safeFile(b.data_url);
      if (!data)
        throw fail(400, "Choisissez une photo ou un PDF de moins de 3 Mo.");
      const [linked] =
        await sql`SELECT 1 FROM appointments WHERE professional_id=${workspaceId} AND patient_id=${b.patient_id}`;
      if (!linked) throw fail(403, "Patient non lié.");
      await sql`INSERT INTO dental_media(id,owner_id,patient_id,appointment_id,kind,title,data_url) VALUES(${randomUUID()},${workspaceId},${b.patient_id},${uuid(b.appointment_id) ? b.appointment_id : null},${b.kind},${clean(b.title, 180)},${data})`;
      return send({ ok: true });
    }
    if (action === "visit-note-save" && req.method === "POST") {
      roleCheck(account, "professional", "worker", "admin");
      if (!uuid(b.patient_id) || !clean(b.title, 180))
        throw fail(400, "Renseignez le rendez-vous et son titre.");
      const tooth =
        b.tooth_data && typeof b.tooth_data === "object" ? b.tooth_data : {};
      await sql`INSERT INTO visit_notes(id,owner_id,patient_id,appointment_id,title,clinical_note,treatment_plan,tooth_data) VALUES(${randomUUID()},${workspaceId},${b.patient_id},${uuid(b.appointment_id) ? b.appointment_id : null},${clean(b.title, 180)},${clean(b.clinical_note, 8000)},${clean(b.treatment_plan, 8000)},${JSON.stringify(tooth)}::jsonb)`;
      return send({ ok: true });
    }
    if (action === "clinic-member-add" && req.method === "POST") {
      if (membership)
        throw fail(403, "Seul le propriétaire du cabinet peut gérer l’équipe.");
      roleCheck(account, "professional", "admin");
      const email = clean(b.email, 254).toLowerCase();
      const [member] =
        await sql`SELECT id,role FROM accounts WHERE email=${email} AND role IN ('professional','worker')`;
      if (!member)
        throw fail(
          404,
          "Créez d’abord le compte professionnel ou assistant avec cet e-mail.",
        );
      if (member.id === account.id)
        throw fail(400, "Ce compte est déjà propriétaire du cabinet.");
      const allowed = [
        "agenda",
        "patients_admin",
        "clinical",
        "billing",
        "messages",
        "tasks",
      ];
      const permissions = (
        Array.isArray(b.permissions) ? b.permissions : []
      ).filter((x) => allowed.includes(x));
      await sql`INSERT INTO clinic_members(id,owner_id,member_id,job_title,permissions) VALUES(${randomUUID()},${workspaceId},${member.id},${clean(b.job_title, 120)},${JSON.stringify(permissions)}::jsonb) ON CONFLICT(owner_id,member_id) DO UPDATE SET job_title=excluded.job_title,permissions=excluded.permissions,active=true`;
      return send({ ok: true });
    }
    if (action === "service-save" && req.method === "POST") {
      roleCheck(account, "professional", "worker", "admin");
      const name = clean(b.name, 160),
        price = Number(b.price),
        vat = Number(b.vat || 0),
        duration = Number(b.duration || 45);
      if (
        !name ||
        !Number.isFinite(price) ||
        price < 0 ||
        price > 100000 ||
        !Number.isFinite(vat) ||
        vat < 0 ||
        vat > 100 ||
        !Number.isInteger(duration) ||
        duration < 5 ||
        duration > 480
      )
        throw fail(
          400,
          "Vérifiez la prestation, sa durée, son prix et sa TVA.",
        );
      if (b.id) {
        if (!uuid(b.id)) throw fail(400, "Prestation invalide.");
        const rows =
          await sql`UPDATE services SET name=${name},description=${clean(b.description, 1500)},duration=${duration},price=${price},vat=${vat},active=${b.active !== false} WHERE id=${b.id} AND owner_id=${workspaceId} RETURNING id`;
        if (!rows.length) throw fail(404, "Prestation introuvable.");
        return send({ ok: true });
      }
      await sql`INSERT INTO services(id,owner_id,name,description,duration,price,vat) VALUES(${randomUUID()},${workspaceId},${name},${clean(b.description, 1500)},${duration},${price},${vat})`;
      return send({ ok: true });
    }
    if (action === "service-toggle" && req.method === "POST") {
      roleCheck(account, "professional", "worker", "admin");
      if (!uuid(b.id)) throw fail(400, "Prestation invalide.");
      await sql`UPDATE services SET active=${!!b.active} WHERE id=${b.id} AND owner_id=${workspaceId}`;
      return send({ ok: true });
    }
    if (action === "document-create" && req.method === "POST") {
      roleCheck(account, "professional", "worker", "admin");
      if (!uuid(b.patient_id)) throw fail(400, "Patient invalide.");
      const [linked] =
        await sql`SELECT id FROM appointments WHERE professional_id=${workspaceId} AND patient_id=${b.patient_id} ORDER BY created_at DESC LIMIT 1`;
      if (!linked) throw fail(403, "Patient non lié.");
      const raw = Array.isArray(b.items) ? b.items.slice(0, 30) : [];
      const items = raw
        .map((x) => ({
          label: clean(x.label, 180),
          quantity: Math.max(0.01, Math.min(10000, Number(x.quantity) || 1)),
          unitPrice: Math.max(0, Math.min(100000, Number(x.unitPrice) || 0)),
          vat: Math.max(0, Math.min(100, Number(x.vat) || 0)),
        }))
        .filter((x) => x.label);
      if (!items.length) throw fail(400, "Ajoutez au moins une ligne.");
      const subtotal = items.reduce((s, x) => s + x.quantity * x.unitPrice, 0),
        tax = items.reduce(
          (s, x) => s + (x.quantity * x.unitPrice * x.vat) / 100,
          0,
        ),
        total = subtotal + tax;
      const type = b.doc_type === "invoice" ? "invoice" : "quote",
        prefix = type === "invoice" ? "FAC" : "DEV",
        number =
          prefix +
          "-" +
          new Date().getFullYear() +
          "-" +
          String(Date.now()).slice(-6),
        id = randomUUID();
      await sql`INSERT INTO business_documents(id,owner_id,patient_id,appointment_id,doc_type,number,due_date,items,subtotal,tax,total,note,payment_provider,payment_url) VALUES(${id},${workspaceId},${b.patient_id},${uuid(b.appointment_id) ? b.appointment_id : null},${type},${number},${b.due_date || null},${JSON.stringify(items)}::jsonb,${subtotal},${tax},${total},${clean(b.note, 2500)},${safeUrl(b.payment_url) ? "Qonto" : ""},${safeUrl(b.payment_url)})`;
      return send({ id, number });
    }
    if (action === "document-send" && req.method === "POST") {
      roleCheck(account, "professional", "worker", "admin");
      if (!uuid(b.id)) throw fail(400, "Document invalide.");
      const [doc] =
        await sql`UPDATE business_documents SET status='sent',sent_at=now() WHERE id=${b.id} AND owner_id=${workspaceId} RETURNING *`;
      if (!doc) throw fail(404, "Document introuvable.");
      const [ap] =
        await sql`SELECT id FROM appointments WHERE professional_id=${workspaceId} AND patient_id=${doc.patient_id} ORDER BY created_at DESC LIMIT 1`;
      if (ap)
        await sql`INSERT INTO messages(id,appointment_id,sender_id,body,document_id) VALUES(${randomUUID()},${ap.id},${account.id},${doc.doc_type === "quote" ? "Devis" : "Facture"}+' '+doc.number+' · '+Number(doc.total).toFixed(2)+' €',${doc.id})`;
      return send({ ok: true, appointment_id: ap?.id || null });
    }
    if (action === "document-status" && req.method === "POST") {
      roleCheck(account, "professional", "worker", "admin");
      if (!uuid(b.id) || !["accepted", "paid", "cancelled"].includes(b.status))
        throw fail(400, "Statut invalide.");
      await sql`UPDATE business_documents SET status=${b.status} WHERE id=${b.id} AND owner_id=${workspaceId}`;
      return send({ ok: true });
    }
    if (action === "document-update" && req.method === "POST") {
      roleCheck(account, "professional", "worker", "admin");
      if (
        !uuid(b.id) ||
        !["draft", "sent", "accepted", "paid", "cancelled"].includes(b.status)
      )
        throw fail(400, "Document invalide.");
      const pdf = b.pdf_data ? safeFile(b.pdf_data) : null;
      if (b.pdf_data && !pdf)
        throw fail(400, "Le PDF dépasse 3 Mo ou son format est invalide.");
      await sql`UPDATE business_documents SET status=${b.status},issue_date=${b.issue_date || new Date().toISOString().slice(0, 10)},due_date=${b.due_date || null},payment_provider=${safeUrl(b.payment_url) ? "Qonto" : ""},payment_url=${safeUrl(b.payment_url)},pdf_data=coalesce(${pdf},pdf_data),pdf_name=CASE WHEN ${pdf} IS NULL THEN pdf_name ELSE ${clean(b.pdf_name, 180)} END,note=${clean(b.note, 2500)} WHERE id=${b.id} AND owner_id=${workspaceId}`;
      return send({ ok: true });
    }
    if (action === "task-save" && req.method === "POST") {
      roleCheck(account, "professional", "worker", "admin");
      const title = clean(b.title, 200),
        stage = ["À faire", "En cours", "En attente", "Terminé"].includes(
          b.stage,
        )
          ? b.stage
          : "À faire",
        priority = ["Basse", "Normale", "Haute", "Urgente"].includes(b.priority)
          ? b.priority
          : "Normale";
      if (!title) throw fail(400, "Donnez un titre à la tâche.");
      const checklist = (Array.isArray(b.checklist) ? b.checklist : [])
        .slice(0, 50)
        .map((x, i) => ({
          id: clean(x.id, 80) || String(i),
          text: clean(x.text, 300),
          done: !!x.done,
        }))
        .filter((x) => x.text);
      const attachments = (Array.isArray(b.attachments) ? b.attachments : [])
        .slice(0, 20)
        .map((x) => ({
          name: clean(x.name, 180),
          url: safeUrl(x.url) || safeImage(x.url),
        }))
        .filter((x) => x.name && x.url);
      const due =
          b.due_at && Number.isFinite(new Date(b.due_at).getTime())
            ? new Date(b.due_at).toISOString()
            : null,
        patient = uuid(b.patient_id) ? b.patient_id : null;
      if (b.id) {
        if (!uuid(b.id)) throw fail(400, "Tâche invalide.");
        await sql`UPDATE tasks SET title=${title},description=${clean(b.description, 5000)},stage=${stage},priority=${priority},due_at=${due},assignee=${clean(b.assignee, 120)},patient_id=${patient},checklist=${JSON.stringify(checklist)}::jsonb,attachments=${JSON.stringify(attachments)}::jsonb,updated_at=now() WHERE id=${b.id} AND owner_id=${workspaceId}`;
      } else
        await sql`INSERT INTO tasks(id,owner_id,title,description,stage,priority,due_at,assignee,patient_id,checklist,attachments) VALUES(${randomUUID()},${workspaceId},${title},${clean(b.description, 5000)},${stage},${priority},${due},${clean(b.assignee, 120)},${patient},${JSON.stringify(checklist)}::jsonb,${JSON.stringify(attachments)}::jsonb)`;
      return send({ ok: true });
    }
    if (action === "task-stage" && req.method === "POST") {
      roleCheck(account, "professional", "worker", "admin");
      if (
        !uuid(b.id) ||
        !["À faire", "En cours", "En attente", "Terminé"].includes(b.stage)
      )
        throw fail(400, "Tâche invalide.");
      await sql`UPDATE tasks SET stage=${b.stage},updated_at=now() WHERE id=${b.id} AND owner_id=${workspaceId}`;
      return send({ ok: true });
    }
    if (action === "mission-save" && req.method === "POST") {
      roleCheck(account, "professional", "worker", "admin");
      const title = clean(b.title, 180),
        assignee = clean(b.assignee, 120);
      if (!title || !assignee)
        throw fail(400, "Indiquez la mission et la personne assignée.");
      const photo = safeImage(b.photo_data);
      if (b.photo_data && !photo)
        throw fail(400, "Photo trop volumineuse ou invalide.");
      await sql`INSERT INTO missions(id,owner_id,appointment_id,assignee,title,address,status,eta,latitude,longitude,photo_data) VALUES(${randomUUID()},${workspaceId},${uuid(b.appointment_id) ? b.appointment_id : null},${assignee},${title},${clean(b.address, 300)},'planned',${Math.max(0, Math.min(240, Number(b.eta) || 0))},${Number.isFinite(Number(b.latitude)) ? Number(b.latitude) : null},${Number.isFinite(Number(b.longitude)) ? Number(b.longitude) : null},${photo})`;
      return send({ ok: true });
    }
    if (action === "mission-status" && req.method === "POST") {
      roleCheck(account, "professional", "worker", "admin");
      if (
        !uuid(b.id) ||
        !["planned", "en_route", "nearby", "arrived", "completed"].includes(
          b.status,
        )
      )
        throw fail(400, "Mission invalide.");
      await sql`UPDATE missions SET status=${b.status},eta=${Math.max(0, Math.min(240, Number(b.eta) || 0))},updated_at=now() WHERE id=${b.id} AND owner_id=${workspaceId}`;
      return send({ ok: true });
    }

    if (action === "admin" && req.method === "GET") {
      roleCheck(account, "admin");
      const [counts, accounts, appointments, audit, settings] =
        await Promise.all([
          sql`SELECT (SELECT count(*)::int FROM accounts) AS accounts,(SELECT count(*)::int FROM accounts WHERE role='patient') AS patients,(SELECT count(*)::int FROM accounts WHERE role IN('professional','worker')) AS professionals,(SELECT count(*)::int FROM profiles p JOIN accounts a ON a.id=p.account_id WHERE p.published AND NOT a.suspended) AS published,(SELECT count(*)::int FROM accounts a JOIN profiles p ON a.id=p.account_id WHERE a.role IN('professional','worker') AND NOT p.verified) AS pending,(SELECT count(*)::int FROM appointments WHERE status='confirmed') AS confirmed,(SELECT count(*)::int FROM appointments WHERE status='cancelled') AS cancelled,(SELECT count(*)::int FROM accounts WHERE suspended) AS suspended`,
          sql`SELECT a.id,a.name,a.email,a.role,a.created_at,a.suspended,p.verified,p.identifier,p.specialty,p.city,p.published,p.qualifications FROM accounts a JOIN profiles p ON a.id=p.account_id ORDER BY a.created_at DESC LIMIT 1000`,
          sql`SELECT ap.id,ap.status,ap.created_at,s.starts_at,s.duration,pa.name AS patient_name,pr.name AS professional_name FROM appointments ap JOIN slots s ON s.id=ap.slot_id JOIN accounts pa ON pa.id=ap.patient_id JOIN accounts pr ON pr.id=ap.professional_id ORDER BY s.starts_at DESC LIMIT 1000`,
          sql`SELECT l.id,l.action,l.target_id,l.detail,l.created_at,a.name AS actor_name FROM audit_log l JOIN accounts a ON a.id=l.actor_id ORDER BY l.created_at DESC LIMIT 300`,
          sql`SELECT * FROM platform_settings WHERE id=1`,
        ]);
      return send({
        counts: counts[0],
        accounts,
        appointments,
        audit,
        settings: settings[0],
      });
    }
    if (action === "admin-verify" && req.method === "POST") {
      roleCheck(account, "admin");
      if (!uuid(b.id)) throw fail(400, "Profil invalide.");
      const [target] =
        await sql`SELECT a.id,p.identifier FROM accounts a JOIN profiles p ON a.id=p.account_id WHERE a.id=${b.id} AND a.role IN('professional','worker')`;
      if (!target) throw fail(404, "Professionnel introuvable.");
      if (b.verified && !target.identifier)
        throw fail(
          400,
          "Identifiant professionnel obligatoire pour la vérification.",
        );
      await sql.transaction([
        sql`UPDATE profiles SET verified=${!!b.verified} WHERE account_id=${b.id}`,
        sql`INSERT INTO audit_log(id,actor_id,action,target_id,detail) VALUES(${randomUUID()},${account.id},${b.verified ? "profile_verified" : "verification_removed"},${b.id},${clean(b.note, 500)})`,
      ]);
      return send({ ok: true });
    }
    if (action === "admin-suspend" && req.method === "POST") {
      roleCheck(account, "admin");
      if (!uuid(b.id) || b.id === account.id)
        throw fail(400, "Vous ne pouvez pas suspendre votre propre compte.");
      if (!clean(b.note, 500))
        throw fail(400, "Indiquez le motif de cette décision.");
      const [target] =
        await sql`SELECT id FROM accounts WHERE id=${b.id} AND role<>'admin'`;
      if (!target)
        throw fail(403, "Cette action n’est pas permise sur ce compte.");
      await sql.transaction([
        sql`UPDATE accounts SET suspended=${!!b.suspended} WHERE id=${b.id}`,
        sql`DELETE FROM sessions WHERE account_id=${b.id}`,
        sql`INSERT INTO audit_log(id,actor_id,action,target_id,detail) VALUES(${randomUUID()},${account.id},${b.suspended ? "account_suspended" : "account_reactivated"},${b.id},${clean(b.note, 500)})`,
      ]);
      return send({ ok: true });
    }
    if (action === "admin-unpublish" && req.method === "POST") {
      roleCheck(account, "admin");
      if (!uuid(b.id) || !clean(b.note, 500))
        throw fail(400, "Profil et motif obligatoires.");
      const [target] =
        await sql`SELECT id FROM accounts WHERE id=${b.id} AND role IN('professional','worker')`;
      if (!target) throw fail(404, "Professionnel introuvable.");
      await sql.transaction([
        sql`UPDATE profiles SET published=false WHERE account_id=${b.id}`,
        sql`INSERT INTO audit_log(id,actor_id,action,target_id,detail) VALUES(${randomUUID()},${account.id},'profile_unpublished',${b.id},${clean(b.note, 500)})`,
      ]);
      return send({ ok: true });
    }
    if (action === "admin-settings" && req.method === "POST") {
      roleCheck(account, "admin");
      const name = clean(b.name, 60),
        email = clean(b.support_email, 254);
      if (!name || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))
        throw fail(400, "Vérifiez le nom et l’e-mail de contact.");
      await sql.transaction([
        sql`UPDATE platform_settings SET name=${name},support_email=${email},announcement=${clean(b.announcement, 300)},updated_at=now() WHERE id=1`,
        sql`INSERT INTO audit_log(id,actor_id,action,detail) VALUES(${randomUUID()},${account.id},'settings_updated','Informations publiques de la plateforme modifiées')`,
      ]);
      return send({ ok: true });
    }
    throw fail(404, "Action introuvable.");
  } catch (e) {
    if (e.code === "23505")
      return res
        .status(409)
        .json({ error: "Ce compte ou ce créneau existe déjà." });
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error("Amelib API failure:", e.code || e.name);
    return res
      .status(500)
      .json({ error: "Une erreur est survenue. Réessayez dans un instant." });
  }
}
