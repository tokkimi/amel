import { api } from './client';
export type SharedFile = { id: string; name: string; mime: string; size: number; localUrl?: string };
export async function uploadSharedFile(file: File, action: (name: string) => string, progress: (n: number) => void): Promise<SharedFile> {
 if (!file.size || file.size > 50 * 1024 * 1024) throw new Error('50 Mo maximum par fichier.');
 const mime = file.type.split(';')[0] || (/\.pdf$/i.test(file.name) ? 'application/pdf' : '');
 const { id } = await api(action('collaboration-file-start'), { name: file.name, size: file.size, mime });
 for (let offset = 0, part = 0; offset < file.size; offset += 262144, part++) {
  const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('Lecture du fichier impossible.')); reader.readAsDataURL(file.slice(offset, offset + 262144)); });
  let error: unknown;
  for (let attempt = 0; attempt < 3; attempt++) { try { await api(action('collaboration-file-chunk'), { id, part, data }); error = undefined; break; } catch (e) { error = e; } }
  if (error) throw error;
  progress(Math.round(Math.min(offset + 262144, file.size) / file.size * 100));
 }
 await api(action('collaboration-file-finish'), { id });
 return { id, name: file.name, mime, size: file.size, localUrl: URL.createObjectURL(file) };
}
export async function readSharedFile(id: string, action: (name: string) => string) {
 const info = await api(action('collaboration-file-read') + '&id=' + encodeURIComponent(id));
 const buffers: Uint8Array<ArrayBuffer>[] = [];
 for (let part = 0; part < info.parts; part++) { const chunk = await api(action('collaboration-file-read') + '&id=' + encodeURIComponent(id) + '&part=' + part); buffers.push(Uint8Array.from(atob(chunk.data), c => c.charCodeAt(0))); }
 return { ...info, url: URL.createObjectURL(new Blob(buffers, { type: info.mime })) };
}
export function calendarFile(m: any) {
 const stamp = (value: number | string) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
 const value = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SmilePec//Rendez-vous//FR', 'BEGIN:VEVENT', 'UID:' + m.id + '@smilepec.fr', 'DTSTAMP:' + stamp(Date.now()), 'DTSTART:' + stamp(m.starts_at), 'DTEND:' + stamp(+new Date(m.starts_at) + m.duration * 60000), 'SUMMARY:Rendez-vous SmilePec', 'STATUS:' + (m.status === 'confirmed' ? 'CONFIRMED' : m.status === 'cancelled' ? 'CANCELLED' : 'TENTATIVE'), 'URL:' + location.origin + '/smilepec', 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
 const a = document.createElement('a'), url = URL.createObjectURL(new Blob([value], { type: 'text/calendar' })); a.href = url; a.download = 'rendez-vous-smilepec.ics'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}
