"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function ContactsDirectory({ contacts }: { contacts: Array<{ id: string; name: string; role: string; email: string; institution: { name: string } }> }) {
  const [selected, setSelected] = useState(contacts[0]);
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <table className="w-full text-left text-sm"><tbody>{contacts.map((contact) => <tr key={contact.id} className="border-b"><td className="py-3">{contact.institution.name}</td><td>{contact.name}</td><td>{contact.role}</td><td><Button type="button" variant="secondary" className="h-8" onClick={() => setSelected(contact)}>查看</Button></td></tr>)}</tbody></table>
      {selected ? <aside className="rounded-md border border-[var(--cx-border)] p-4"><h2 className="font-semibold">{selected.name}</h2><p className="text-sm text-slate-500">{selected.email}</p><p className="mt-2 text-sm">{selected.institution.name} · {selected.role}</p><a className="mt-4 inline-block text-[var(--cx-blue)]" href={`/space/inbox?receiverId=${selected.id}`}>发消息</a></aside> : null}
    </div>
  );
}
