import { useState, useEffect } from "react";
import { getProfile, saveProfile, type RiderProfile } from "../db/profile";

const EMPTY_FORM = {
  lastName: "",
  firstName: "",
  birthDate: "",
  address: "",
  zipCode: "",
  city: "",
  country: "",
  clubName: "",
  acpCode: "",
};

export default function ProfilePage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getProfile().then((p) => {
      if (p) {
        setForm({
          lastName: p.lastName,
          firstName: p.firstName,
          birthDate: p.birthDate,
          address: p.address,
          zipCode: p.zipCode,
          city: p.city,
          country: p.country,
          clubName: p.clubName,
          acpCode: p.acpCode,
        });
      }
    });
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setSaved(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await saveProfile(form);
    setSaved(true);
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Profile</h1>

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        🔒 Stored on this device only — never synced or sent to any server.
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Last Name" name="lastName" value={form.lastName} onChange={handleChange} />
          <Field label="First Name" name="firstName" value={form.firstName} onChange={handleChange} />
        </div>
        <Field label="Date of Birth (dd/mm/yyyy)" name="birthDate" value={form.birthDate} onChange={handleChange} placeholder="15/03/1985" />
        <Field label="Address" name="address" value={form.address} onChange={handleChange} />
        <div className="grid grid-cols-3 gap-4">
          <Field label="ZIP Code" name="zipCode" value={form.zipCode} onChange={handleChange} />
          <Field label="City" name="city" value={form.city} onChange={handleChange} />
          <Field label="Country / State" name="country" value={form.country} onChange={handleChange} />
        </div>
        <Field label="Club Name (NO abbreviations)" name="clubName" value={form.clubName} onChange={handleChange} />
        <Field label="ACP Code" name="acpCode" value={form.acpCode} onChange={handleChange} />

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            Save
          </button>
          {saved && <span className="text-sm text-green-700 font-medium">Saved ✓</span>}
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      <input
        type="text"
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
      />
    </div>
  );
}
