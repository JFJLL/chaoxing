"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function ContactsDirectory({ contacts }: { contacts: Array<{ id: string; name: string; role: string; email: string; institution: { name: string } }> }) {
  const [selected, setSelected] = useState(contacts[0]);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const roles = Array.from(new Set(contacts.map((contact) => contact.role))).sort();
  const visibleContacts = contacts.filter((contact) => {
    const matchesText = `${contact.name} ${contact.email} ${contact.institution.name}`.toLowerCase().includes(q.toLowerCase());
    const matchesRole = !role || contact.role === role;
    return matchesText && matchesRole;
  });
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-[1fr_180px]">
          <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="搜索姓名、邮箱或单位" />
          <select value={role} onChange={(event) => setRole(event.target.value)} className="h-10 rounded-md border px-3">
            <option value="">全部角色</option>
            {roles.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <table className="w-full text-left text-sm"><tbody>{visibleContacts.map((contact) => <tr key={contact.id} className="border-b"><td className="py-3">{contact.institution.name}</td><td>{contact.name}</td><td>{contact.role}</td><td><Button type="button" variant="secondary" className="h-8" onClick={() => setSelected(contact)}>查看</Button></td></tr>)}</tbody></table>
      </div>
      {selected ? <aside className="rounded-md border border-[var(--cx-border)] p-4"><h2 className="font-semibold">{selected.name}</h2><p className="text-sm text-slate-500">{selected.email}</p><p className="mt-2 text-sm">{selected.institution.name} · {selected.role}</p><a className="mt-4 inline-block text-[var(--cx-blue)]" href={`/space/inbox?receiverId=${selected.id}`}>发消息</a></aside> : null}
    </div>
  );
}
