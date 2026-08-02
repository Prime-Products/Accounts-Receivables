/**
 * Address Book — the master directory of AR Pro.
 *
 * Four tabs over the same list machinery (groups, companies, vessels, contacts),
 * a search that spans all of them, per-user column layouts, saved views and
 * exports of exactly what is on screen. ERP-owned data stays read-only; anything
 * the team needs on top lives in custom fields.
 */
import {
  AddressBookTable,
  type ColumnDef,
  type SortState,
} from "@/components/AddressBookTable";
import { AddressBookRecordDialog, type RecordTarget } from "@/components/AddressBookRecordDialog";
import {
  applyFieldFilters,
  FieldFilterBar,
  opNeedsValue,
  type FieldFilter,
} from "@/components/AddressBookFilters";
import { ColumnPicker, ExportMenu } from "@/components/AddressBookToolbar";
import { DataQualityPanel } from "@/components/DataQualityPanel";
import { GiftReviewPanel } from "@/components/GiftReviewPanel";
import { ImportContactsDialog } from "@/components/ImportContactsDialog";
import { MergeContactsDialog, type MergeCandidate } from "@/components/MergeContactsDialog";
import { CustomFieldsManager } from "@/components/CustomFieldsManager";
import { SavedViewsBar } from "@/components/SavedViewsBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { matchesAllTokens } from "@shared/textMatch";
import {
  Archive,
  ArchiveRestore,
  BookUser,
  Building2,
  Contact,
  Gift,
  Mail,
  Merge,
  Phone,
  Plus,
  Search,
  Ship,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ContactFormDialog, type ContactRow } from "@/components/ContactFormDialog";

type Entity = "group" | "customer" | "vessel" | "contact";

const TABS: { value: Entity; label: string; icon: typeof Users }[] = [
  { value: "group", label: "Groups", icon: Users },
  { value: "customer", label: "Companies", icon: Building2 },
  { value: "vessel", label: "Vessels", icon: Ship },
  { value: "contact", label: "Contacts", icon: Mail },
];

/** Human noun for the summary strip, e.g. "3 vessels shown". */
function entityNoun(entity: Entity, n: number): string {
  const one = n === 1;
  switch (entity) {
    case "group":
      return one ? "group" : "groups";
    case "customer":
      return one ? "company" : "companies";
    case "vessel":
      return one ? "vessel" : "vessels";
    default:
      return one ? "contact" : "contacts";
  }
}

/** Shape stored in a saved view. */
type ViewConfig = {
  search?: string;
  group?: string;
  extra?: string;
  /** Contacts tab: Person / Department / all. */
  contactType?: "all" | "Person" | "Department";
  /** Contacts tab: on the gift list or not. */
  gift?: "all" | "gift" | "nogift";
  filters?: FieldFilter[];
  sort?: SortState;
  hidden?: string[];
  order?: string[];
};

export default function AddressBook() {
  const [, navigate] = useLocation();
  // Tab lives in the URL (?tab=contact) so a tab can be linked, bookmarked and survives a reload.
  const [entity, setEntity] = useState<Entity>(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    return TABS.some(x => x.value === t) ? (t as Entity) : "group";
  });
  // A ?q= param lets the global search hand off to this list already filtered.
  const [search, setSearch] = useState(
    () => new URLSearchParams(window.location.search).get("q") ?? "",
  );
  const [groupFilter, setGroupFilter] = useState("all");
  /** Second filter: position for contacts, vessel type for vessels, tier for companies. */
  const [extraFilter, setExtraFilter] = useState("all");
  /** Contacts tab only: Person / Department / all. */
  const [typeFilter, setTypeFilter] = useState<"all" | "Person" | "Department">("all");
  /** Contacts tab only: gift recipients / not on the list / all. */
  const [giftFilter, setGiftFilter] = useState<"all" | "gift" | "nogift">("all");
  /** Column-level conditions, usable on custom fields too. */
  const [fieldFilters, setFieldFilters] = useState<FieldFilter[]>([]);
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [activeViewId, setActiveViewId] = useState<number | null>(null);
  const [target, setTarget] = useState<RecordTarget | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<ContactRow | null>(null);
  /** Contacts tab only: show the archive instead of the live directory. */
  const [showArchived, setShowArchived] = useState(false);
  /** Rows ticked in the contacts list, for a manual merge. */
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [manualMerge, setManualMerge] = useState<MergeCandidate[] | null>(null);

  const utils = trpc.useUtils();
  const { data: counts } = trpc.addressBook.counts.useQuery();
  const groupsQ = trpc.addressBook.groups.useQuery(undefined, { enabled: entity === "group" });
  const customersQ = trpc.addressBook.customers.useQuery(undefined, { enabled: entity === "customer" });
  const vesselsQ = trpc.addressBook.vessels.useQuery(undefined, { enabled: entity === "vessel" });
  const contactsQ = trpc.addressBook.contacts.useQuery(
    { archived: showArchived },
    { enabled: entity === "contact" },
  );

  const refreshContacts = () => {
    utils.addressBook.contacts.invalidate();
    utils.addressBook.counts.invalidate();
    utils.addressBook.quality.invalidate();
  };

  const archiveContact = trpc.addressBook.archiveContact.useMutation({
    onSuccess: () => {
      toast.success("Contact archived — you can restore it from the Archive view");
      refreshContacts();
    },
    onError: e => toast.error(e.message),
  });
  const restoreContact = trpc.addressBook.restoreContact.useMutation({
    onSuccess: () => {
      toast.success("Contact restored");
      refreshContacts();
    },
    onError: e => toast.error(e.message),
  });
  // Bulk retype: fastest way to tidy the directory once departments are spotted.
  const setTypeBulk = trpc.addressBook.setContactTypeBulk.useMutation({
    onSuccess: r => {
      toast.success(`${r.updated} contact${r.updated === 1 ? "" : "s"} updated`);
      setSelectedIds([]);
      refreshContacts();
      utils.paymentContacts.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const { data: fieldDefs } = trpc.addressBook.fields.useQuery({ entity });

  const listKey = `address-book-${entity}`;
  const { data: savedLayout } = trpc.addressBook.layout.useQuery({ listKey });
  const [hidden, setHidden] = useState<string[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const saveLayout = trpc.addressBook.saveLayout.useMutation({
    onSuccess: () => utils.addressBook.layout.invalidate({ listKey }),
  });

  // Adopt the stored layout whenever the tab (and therefore the list key) changes.
  useEffect(() => {
    setHidden(savedLayout?.hidden ?? []);
    setOrder(savedLayout?.order ?? []);
  }, [savedLayout, listKey]);

  // Let the record dialog re-open itself on a related record.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<RecordTarget>).detail;
      setTarget(detail);
      setDialogOpen(true);
    };
    window.addEventListener("address-book:open", handler);
    return () => window.removeEventListener("address-book:open", handler);
  }, []);

  // Deep link: /address-book?tab=group&record=<key> opens that card straight away.
  const [deepLinked, setDeepLinked] = useState(false);
  useEffect(() => {
    if (deepLinked) return;
    const key = new URLSearchParams(window.location.search).get("record");
    if (!key) return;
    setDeepLinked(true);
    // Groups and companies live on their own card page, so a deep link hands off
    // there rather than opening the modal on top of the list.
    if (entity === "group") {
      navigate(`/groups/${encodeURIComponent(key)}`);
      return;
    }
    if (entity === "customer") {
      navigate(`/customers/${key}`);
      return;
    }
    setTarget({ entity, recordKey: key, title: key });
    setDialogOpen(true);
  }, [entity, deepLinked, navigate]);

  const applyLayout = (next: { hidden: string[]; order: string[] }) => {
    setHidden(next.hidden);
    setOrder(next.order);
    saveLayout.mutate({ listKey, hidden: next.hidden, order: next.order });
  };

  const openRecord = (t: RecordTarget) => {
    setTarget(t);
    setDialogOpen(true);
  };

  /** Custom-field columns, appended to every list so new fields are instantly usable. */
  const customColumns = useMemo<ColumnDef<any>[]>(
    () =>
      (fieldDefs ?? []).map(f => ({
        key: `custom:${f.fieldKey}`,
        label: f.label,
        width: 160,
        value: (row: any) => {
          const v = row.custom?.[f.fieldKey] ?? "";
          if (f.fieldType === "checkbox") return v === "1" ? "Yes" : "";
          return v;
        },
      })),
    [fieldDefs],
  );

  const baseColumns = useMemo<ColumnDef<any>[]>(() => {
    if (entity === "group") {
      return [
        {
          key: "group",
          label: "Group",
          width: 300,
          readOnly: true,
          value: r => r.group,
          render: r => (
            <span className="inline-flex items-center gap-1.5 max-w-full font-medium text-sky-700">
              <Users className="h-3.5 w-3.5 shrink-0 opacity-70" />
              <span className="truncate">{r.group}</span>
            </span>
          ),
        },
        { key: "companies", label: "Companies", width: 110, align: "right", readOnly: true, value: r => r.companies },
        { key: "vessels", label: "Vessels", width: 100, align: "right", readOnly: true, value: r => r.vessels },
        { key: "contacts", label: "Contacts", width: 100, align: "right", readOnly: true, value: r => r.contacts },
        {
          key: "primaryEmail",
          label: "Primary email",
          width: 240,
          readOnly: true,
          value: r => r.primaryEmail,
          render: r =>
            r.primaryEmail ? (
              <a
                className="text-blue-600 hover:underline truncate block"
                href={`mailto:${r.primaryEmail}`}
                onClick={e => e.stopPropagation()}
              >
                {r.primaryEmail}
              </a>
            ) : (
              "—"
            ),
        },
        { key: "codes", label: "ERP codes", width: 200, readOnly: true, value: r => r.codes },
        {
          key: "openDesk",
          label: "",
          width: 130,
          sortable: false,
          value: () => "",
          render: r => (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={e => {
                e.stopPropagation();
                navigate(`/groups/${encodeURIComponent(r.group)}`);
              }}
            >
              Collections →
            </Button>
          ),
        },
      ];
    }
    if (entity === "customer") {
      return [
        {
          key: "name",
          label: "Company",
          width: 280,
          readOnly: true,
          value: r => r.name,
          render: r => (
            <span className="inline-flex items-center gap-1.5 max-w-full font-medium text-sky-700">
              <Building2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
              <span className="truncate">{r.name}</span>
            </span>
          ),
        },
        { key: "code", label: "ERP code", width: 110, readOnly: true, value: r => r.code },
        { key: "group", label: "Group", width: 240, readOnly: true, value: r => r.group },
        { key: "vatNumber", label: "VAT number", width: 130, readOnly: true, value: r => r.vatNumber },
        {
          key: "email",
          label: "Email",
          width: 220,
          readOnly: true,
          value: r => r.email,
          render: r =>
            r.email ? (
              <a
                className="text-blue-600 hover:underline truncate block"
                href={`mailto:${r.email}`}
                onClick={e => e.stopPropagation()}
              >
                {r.email}
              </a>
            ) : (
              "—"
            ),
        },
        { key: "phone", label: "Phone", width: 150, readOnly: true, value: r => r.phone },
        { key: "contactPerson", label: "Contact person", width: 180, readOnly: true, value: r => r.contactPerson },
        { key: "paymentTermsDays", label: "Terms (d)", width: 100, align: "right", readOnly: true, value: r => r.paymentTermsDays },
        {
          key: "tier",
          label: "Tier",
          width: 110,
          readOnly: true,
          value: r => r.tier,
          render: r => <Badge variant="outline">{r.tier}</Badge>,
        },
        { key: "contacts", label: "Contacts", width: 100, align: "right", readOnly: true, value: r => r.contacts },
      ];
    }
    if (entity === "vessel") {
      return [
        {
          key: "name",
          label: "Vessel",
          width: 240,
          readOnly: true,
          value: r => r.name,
          render: r => (
            <span className="inline-flex items-center gap-1.5 max-w-full font-medium text-sky-700">
              <Ship className="h-3.5 w-3.5 shrink-0 opacity-70" />
              <span className="truncate">{r.name}</span>
            </span>
          ),
        },
        { key: "imo", label: "IMO", width: 110, readOnly: true, value: r => r.imo },
        { key: "vesselType", label: "Type", width: 150, readOnly: true, value: r => r.vesselType },
        { key: "flag", label: "Flag", width: 130, readOnly: true, value: r => r.flag },
        { key: "ownerName", label: "Owner", width: 240, readOnly: true, value: r => r.ownerName },
        { key: "ownerGroup", label: "Group", width: 240, readOnly: true, value: r => r.ownerGroup },
      ];
    }
    return [
      {
        key: "select",
        label: "",
        width: 40,
        sortable: false,
        value: () => "",
        render: r => (
          <Checkbox
            checked={selectedIds.includes(r.id)}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            onCheckedChange={(v: boolean | "indeterminate") =>
              setSelectedIds(ids => (v ? [...ids, r.id] : ids.filter(id => id !== r.id)))
            }
            aria-label={`Select ${r.name}`}
          />
        ),
      },
      {
        key: "name",
        label: "Name",
        width: 220,
        value: r => r.name,
        render: r => {
          // A department (shared mailbox) must be recognisable at a glance so a
          // collector never writes "Dear Maria" to accounts@.
          const dept = r.contactType === "Department";
          return (
            <span
              className={`inline-flex items-center gap-1.5 max-w-full font-medium ${
                dept ? "text-violet-700" : "text-sky-700"
              }`}
            >
              {dept ? (
                <Building2 className="h-3.5 w-3.5 shrink-0 opacity-80" />
              ) : (
                <Contact className="h-3.5 w-3.5 shrink-0 opacity-70" />
              )}
              <span className="truncate">{r.name}</span>
            </span>
          );
        },
      },
      {
        key: "contactType",
        label: "Type",
        width: 120,
        value: r => r.contactType ?? "Person",
        render: r =>
          r.contactType === "Department" ? (
            <Badge className="bg-violet-100 text-violet-700 hover:bg-violet-100 border-violet-200" variant="outline">
              Department
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Person
            </Badge>
          ),
      },
      {
        key: "gift",
        label: "Gift",
        width: 150,
        // Sorting/exporting by the tier name keeps the column meaningful outside the UI.
        value: r => (r.giftTier ? `${r.giftTier}${r.giftYear ? ` ${r.giftYear}` : ""}` : ""),
        render: r =>
          r.giftTier ? (
            <Badge
              variant="outline"
              className="bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-50 gap-1"
              title={
                (r.giftHistory ?? []).length > 1
                  ? `Gift history: ${(r.giftHistory ?? [])
                      .map((g: { year: number; tier: string }) => `${g.year} ${g.tier}`)
                      .join(", ")}`
                  : `On the ${r.giftYear ?? ""} gift list`
              }
            >
              <Gift className="h-3 w-3 shrink-0" />
              <span className="truncate">{r.giftTier}</span>
              {r.giftYear ? <span className="opacity-60">{r.giftYear}</span> : null}
            </Badge>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          ),
      },
      { key: "title", label: "Position", width: 170, value: r => r.title },
      {
        key: "email",
        label: "Email",
        width: 260,
        value: r => r.email,
        render: r => (
          <a
            className="text-blue-600 hover:underline inline-flex items-center gap-1 max-w-full"
            href={`mailto:${r.email}`}
            onClick={e => e.stopPropagation()}
          >
            <Mail className="h-3 w-3 shrink-0" /> <span className="truncate">{r.email}</span>
          </a>
        ),
      },
      {
        key: "phone",
        label: "Phone",
        width: 160,
        value: r => r.phone,
        render: r =>
          r.phone ? (
            <a
              className="text-blue-600 hover:underline inline-flex items-center gap-1 max-w-full"
              href={`tel:${r.phone}`}
              onClick={e => e.stopPropagation()}
            >
              <Phone className="h-3 w-3 shrink-0" /> <span className="truncate">{r.phone}</span>
            </a>
          ) : (
            "—"
          ),
      },
      {
        key: "companyName",
        label: "Company",
        width: 240,
        readOnly: true,
        value: r => r.companyName,
        render: r => {
          // The row carries the joined list plus its count; split it back instead
          // of shipping the array a second time.
          const count = Number((r as { companyCount?: number }).companyCount ?? 1);
          if (count <= 1) return <span className="truncate">{r.companyName}</span>;
          const companies = String(r.companyName ?? "").split(", ");
          // The same person is registered on several companies of the group; the
          // row is collapsed, so name them all on hover.
          return (
            <span className="inline-flex items-center gap-1.5 max-w-full" title={companies.join("\n")}>
              <span className="truncate">{companies[0]}</span>
              <Badge variant="outline" className="shrink-0 h-4 px-1 text-[10px] font-normal">
                +{companies.length - 1}
              </Badge>
            </span>
          );
        },
      },
      {
        key: "group",
        label: "Group",
        width: 240,
        readOnly: true,
        value: r => r.group,
        render: r => {
          const count = Number((r as { groupCount?: number }).groupCount ?? 1);
          if (count <= 1) return <span className="truncate">{r.group}</span>;
          const groups = String(r.group ?? "").split(", ");
          return (
            <span className="inline-flex items-center gap-1.5 max-w-full" title={groups.join("\n")}>
              <span className="truncate">{groups[0]}</span>
              <Badge variant="outline" className="shrink-0 h-4 px-1 text-[10px] font-normal">
                +{groups.length - 1}
              </Badge>
            </span>
          );
        },
      },
      {
        key: "edit",
        label: "",
        width: 150,
        sortable: false,
        value: () => "",
        render: r => (
          <div className="flex items-center justify-end gap-1">
            {showArchived ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={e => {
                  e.stopPropagation();
                  restoreContact.mutate({ id: r.id });
                }}
              >
                <ArchiveRestore className="h-3.5 w-3.5" /> Restore
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={e => {
                    e.stopPropagation();
                    setEditingContact({
                      id: r.id,
                      customerId: r.customerId,
                      name: r.name,
                      email: r.email,
                      phone: r.phone,
                      title: r.title,
                      contactType: r.contactType ?? "Person",
                      companyName: r.companyName,
                      groupName: r.group,
                    });
                    setContactFormOpen(true);
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  title="Archive this contact (keeps its history)"
                  onClick={e => {
                    e.stopPropagation();
                    archiveContact.mutate({ id: r.id });
                  }}
                >
                  <Archive className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        ),
      },
    ];
  }, [entity, navigate]);

  const allColumns = useMemo(() => [...baseColumns, ...customColumns], [baseColumns, customColumns]);

  /** Columns actually rendered: saved order first, hidden ones removed. */
  const columns = useMemo(() => {
    const ordered = [
      ...order.map(k => allColumns.find(c => c.key === k)).filter((c): c is ColumnDef<any> => !!c),
      ...allColumns.filter(c => !order.includes(c.key)),
    ];
    return ordered.filter(c => !hidden.includes(c.key));
  }, [allColumns, order, hidden]);

  const rows = useMemo(() => {
    if (entity === "group") return groupsQ.data ?? [];
    if (entity === "customer") return customersQ.data ?? [];
    if (entity === "vessel") return vesselsQ.data ?? [];
    return contactsQ.data ?? [];
  }, [entity, groupsQ.data, customersQ.data, vesselsQ.data, contactsQ.data]);

  const isLoading =
    entity === "group"
      ? groupsQ.isLoading
      : entity === "customer"
        ? customersQ.isLoading
        : entity === "vessel"
          ? vesselsQ.isLoading
          : contactsQ.isLoading;

  /** Options for the group filter (all tabs) and the second, tab-specific filter. */
  const groupOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows as any[]) {
      const g = entity === "group" ? r.group : entity === "vessel" ? r.ownerGroup : r.group;
      if (g) set.add(g);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows, entity]);

  const extraOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows as any[]) {
      if (entity === "contact") {
        const base = (r.title ?? "").split("—")[0].trim();
        if (base) set.add(base);
      } else if (entity === "vessel") {
        if (r.vesselType) set.add(r.vesselType);
      } else if (entity === "customer") {
        if (r.tier) set.add(r.tier);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows, entity]);

  const extraLabel =
    entity === "contact" ? "All positions" : entity === "vessel" ? "All types" : entity === "customer" ? "All tiers" : "";

  const filtered = useMemo(() => {
    const q = search.trim();
    const base = (rows as any[]).filter(r => {
      const g = entity === "vessel" ? r.ownerGroup : r.group;
      if (groupFilter !== "all" && g !== groupFilter) return false;
      if (entity === "contact" && typeFilter !== "all" && (r.contactType ?? "Person") !== typeFilter) return false;
      if (entity === "contact" && giftFilter !== "all") {
        const onList = Boolean(r.giftTier);
        if (giftFilter === "gift" && !onList) return false;
        if (giftFilter === "nogift" && onList) return false;
      }
      if (extraFilter !== "all") {
        if (entity === "contact" && !(r.title ?? "").toLowerCase().startsWith(extraFilter.toLowerCase())) return false;
        if (entity === "vessel" && r.vesselType !== extraFilter) return false;
        if (entity === "customer" && r.tier !== extraFilter) return false;
      }
      if (!q) return true;
      // Search every visible column (custom fields included) plus the row's
      // hidden related-entity text — people, vessels, company and group — so a
      // vessel name finds its contacts and a person's name finds their company.
      // Accents and word order are handled by matchesAllTokens.
      const haystack: (string | null | undefined)[] = [r.searchText ?? null];
      for (const c of columns) {
        const v = c.value(r);
        if (v !== null && v !== undefined) haystack.push(String(v));
      }
      return matchesAllTokens(q, haystack);
    });
    // Column conditions run against all columns, so a hidden custom field can still filter.
    return applyFieldFilters(base, fieldFilters, allColumns);
  }, [rows, search, groupFilter, extraFilter, typeFilter, giftFilter, entity, columns, fieldFilters, allColumns]);

  const currentConfig: ViewConfig = {
    search,
    group: groupFilter,
    extra: extraFilter,
    contactType: typeFilter,
    gift: giftFilter,
    filters: fieldFilters,
    sort,
    hidden,
    order,
  };

  const applyView = (viewId: number, config: unknown) => {
    const c = (config ?? {}) as ViewConfig;
    setActiveViewId(viewId);
    setSearch(c.search ?? "");
    setGroupFilter(c.group ?? "all");
    setExtraFilter(c.extra ?? "all");
    setTypeFilter(c.contactType ?? "all");
    setGiftFilter(c.gift ?? "all");
    setFieldFilters(c.filters ?? []);
    setSort(c.sort ?? { key: null, dir: "asc" });
    if (c.hidden || c.order) applyLayout({ hidden: c.hidden ?? [], order: c.order ?? [] });
  };

  const switchTab = (next: Entity) => {
    setEntity(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.toString());
    setSearch("");
    setGroupFilter("all");
    setExtraFilter("all");
    setFieldFilters([]);
    setSort({ key: null, dir: "asc" });
    setActiveViewId(null);
    setShowArchived(false);
    setSelectedIds([]);
    setTypeFilter("all");
  };

  const tabCount = (t: Entity) => counts?.[t];
  const hiddenCount = allColumns.filter(c => hidden.includes(c.key)).length;

  /** Clear every filter/sort on the current tab without touching the saved column layout. */
  const resetAll = () => {
    setSearch("");
    setGroupFilter("all");
    setExtraFilter("all");
    setFieldFilters([]);
    setSort({ key: null, dir: "asc" });
    setActiveViewId(null);
    setSelectedIds([]);
    setTypeFilter("all");
  };

  return (
    <div className="p-2 sm:p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BookUser className="h-6 w-6" /> Address Book
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            One directory for groups, companies, vessels and contacts
          </p>
        </div>
        {entity === "contact" && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              variant={showArchived ? "default" : "outline"}
              size="sm"
              className="gap-2"
              onClick={() => {
                setShowArchived(v => !v);
                setSelectedIds([]);
              }}
            >
              <Archive className="h-4 w-4" /> {showArchived ? "Viewing archive" : "Archive"}
            </Button>
            <Button
              size="sm"
              className="gap-2"
              onClick={() => {
                setEditingContact(null);
                setContactFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> New Contact
            </Button>
          </div>
        )}
      </div>

      {/*
       * Switcher + filters sit on one open row directly on the page background,
       * exactly like the Collections Desk (Groups/Companies + search + selects).
       * No surrounding panel: boxing the filters was what made this page look
       * like a different application.
       */}
      <div className="flex flex-wrap gap-3">
        <Tabs value={entity} onValueChange={v => switchTab(v as Entity)}>
          <TabsList className="h-10">
            {TABS.map(t => {
              const Icon = t.icon;
              const n = tabCount(t.value);
              return (
                <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
                  <Icon className="h-4 w-4" />
                  {t.label}
                  {n != null && (
                    <span className="font-mono text-xs text-muted-foreground">{n.toLocaleString()}</span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
        <div className="relative flex-1 min-w-52 sm:max-w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 pr-8"
            placeholder="Search names, vessels, companies, groups…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
              onClick={() => setSearch("")}
              title="Clear"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Select value={groupFilter} onValueChange={setGroupFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All groups" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="all">All groups ({groupOptions.length})</SelectItem>
            {groupOptions.map(g => (
              <SelectItem key={g} value={g}>
                {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {entity === "contact" && (
          <Select value={typeFilter} onValueChange={v => setTypeFilter(v as typeof typeFilter)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">People &amp; departments</SelectItem>
              <SelectItem value="Person">People only</SelectItem>
              <SelectItem value="Department">Departments only</SelectItem>
            </SelectContent>
          </Select>
        )}
        {entity === "contact" && (
          <Select value={giftFilter} onValueChange={v => setGiftFilter(v as typeof giftFilter)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Gift list" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Gift list: everyone</SelectItem>
              <SelectItem value="gift">On the gift list</SelectItem>
              <SelectItem value="nogift">Not on the gift list</SelectItem>
            </SelectContent>
          </Select>
        )}
        {extraLabel && (
          <Select value={extraFilter} onValueChange={setExtraFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder={extraLabel} />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">{extraLabel}</SelectItem>
              {extraOptions.map(o => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/*
       * One secondary tools row: column filters and saved views live here next to
       * the other tools, so the page reads header → filters → tools → summary →
       * table, the same rhythm as Invoices and Vessels.
       */}
      <div className="flex flex-wrap items-center gap-2">
        <FieldFilterBar columns={allColumns} filters={fieldFilters} onChange={setFieldFilters} />
        {entity === "contact" && <ImportContactsDialog onImported={refreshContacts} />}
        <DataQualityPanel />
        {entity === "contact" && <GiftReviewPanel />}
        <CustomFieldsManager entity={entity} />
        <SavedViewsBar
          entity={entity}
          activeViewId={activeViewId}
          currentConfig={currentConfig}
          onApply={applyView}
        />
        <div className="ml-auto flex items-center gap-2">
          <ColumnPicker allColumns={allColumns} hidden={hidden} order={order} onChange={applyLayout} />
          <ExportMenu
            title={`Address Book — ${TABS.find(t => t.value === entity)?.label ?? ""}`}
            columns={columns}
            rows={filtered}
          />
        </div>
      </div>

      {/* Result summary strip — mirrors the Vessels / Invoices totals band */}
      {!isLoading && (
        <div className="rounded-lg border bg-muted/30 px-4 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <span className="text-muted-foreground">
            <span className="font-mono font-semibold text-foreground">{filtered.length.toLocaleString()}</span>{" "}
            {entityNoun(entity, filtered.length)} shown
          </span>
          {tabCount(entity) != null && filtered.length !== tabCount(entity) && (
            <span className="text-muted-foreground">of {tabCount(entity)!.toLocaleString()} in total</span>
          )}
          {showArchived && <span className="text-amber-600 font-medium">Archive view</span>}
          {hiddenCount > 0 && (
            <span className="text-muted-foreground">
              {hiddenCount} column{hiddenCount === 1 ? "" : "s"} hidden
            </span>
          )}
          <button
            type="button"
            onClick={resetAll}
            className="ml-auto text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Reset filters
          </button>
        </div>
      )}

      {entity === "contact" && selectedIds.length > 1 && !showArchived && (
        <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm">
          <span className="text-muted-foreground">{selectedIds.length} contacts selected</span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            onClick={() =>
              setManualMerge(
                (contactsQ.data ?? [])
                  .filter(c => selectedIds.includes(c.id))
                  .map(c => ({
                    id: c.id,
                    name: c.name,
                    email: c.email,
                    phone: c.phone,
                    title: c.title,
                    contactType: c.contactType ?? "Person",
                    customerId: c.customerId,
                    companyName: c.companyName,
                    group: c.group,
                  })),
              )
            }
          >
            <Merge className="h-3.5 w-3.5" /> Merge selected
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            disabled={setTypeBulk.isPending}
            onClick={() => setTypeBulk.mutate({ ids: selectedIds, contactType: "Department" })}
          >
            <Building2 className="h-3.5 w-3.5" /> Mark as department
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            disabled={setTypeBulk.isPending}
            onClick={() => setTypeBulk.mutate({ ids: selectedIds, contactType: "Person" })}
          >
            <Contact className="h-3.5 w-3.5" /> Mark as person
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedIds([])}>
            Clear selection
          </Button>
        </div>
      )}

      <AddressBookTable
        listKey={listKey}
        columns={columns}
        rows={filtered}
        isLoading={isLoading}
        sort={sort}
        onSortChange={setSort}
        emptyMessage={
          search ||
          groupFilter !== "all" ||
          extraFilter !== "all" ||
          fieldFilters.some(f => (opNeedsValue(f.op) ? f.value.trim() !== "" : true))
            ? "No records match your filters"
            : "Nothing here yet"
        }
        onRowClick={r => {
          const any = r as any;
          // Groups and companies own a full receivables card, so the directory
          // opens the very same card the Collections Desk opens. Vessels and
          // contacts have no page of their own and keep using the modal.
          if (entity === "group") {
            navigate(`/groups/${encodeURIComponent(any.group)}`);
            return;
          }
          if (entity === "customer") {
            navigate(`/customers/${any.id}`);
            return;
          }
          openRecord({
            entity,
            recordKey: any.recordKey,
            title: any.name,
            subtitle: entity === "vessel" ? any.ownerGroup : any.companyName,
          });
        }}
      />

      <AddressBookRecordDialog target={target} open={dialogOpen} onOpenChange={setDialogOpen} />

      {manualMerge && manualMerge.length > 1 && (
        <MergeContactsDialog
          candidates={manualMerge}
          open={!!manualMerge}
          onOpenChange={o => !o && setManualMerge(null)}
          onMerged={() => {
            setManualMerge(null);
            setSelectedIds([]);
          }}
        />
      )}

      {contactFormOpen && (
        <ContactFormDialog
          key={editingContact?.id ?? "new"}
          open={contactFormOpen}
          onOpenChange={setContactFormOpen}
          contact={editingContact}
          onSaved={() => {
            utils.addressBook.contacts.invalidate();
            utils.addressBook.counts.invalidate();
          }}
        />
      )}
    </div>
  );
}
