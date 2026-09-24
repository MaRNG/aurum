import clsx from "clsx";
import { ArrowLeftRight, Copy, Pencil, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type { Account, Category, Transaction } from "@/domain/schema";
import { formatDate, formatMoney } from "@/lib/format";
import { IconButton } from "@/components/ui/Button";

export const TYPE_LABEL = { income: "Příjem", expense: "Výdaj", transfer: "Převod" } as const;

const TYPE_LAMP = {
  income: "bg-income",
  expense: "bg-expense",
  transfer: "bg-transparent ring-1 ring-inset ring-slate-400",
} as const;

/** Typ transakce jako kontrolka + popisek; převod má prázdnou kontrolku (nezapočítává se). */
export function TypeBadge({ type }: { type: Transaction["type"] }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
      <span className={clsx("lamp", TYPE_LAMP[type])} />
      {TYPE_LABEL[type]}
    </span>
  );
}

export function SignedAmount({ tx }: { tx: Transaction }) {
  const sign = tx.type === "income" ? 1 : tx.type === "expense" ? -1 : 0;
  return (
    <span
      className={clsx(
        "num font-medium whitespace-nowrap",
        tx.type === "income" && "text-income-ink",
        tx.type === "expense" && "text-slate-900",
        tx.type === "transfer" && "text-slate-500",
      )}
    >
      {sign === 0 ? formatMoney(tx.amount, tx.currency) : formatMoney(sign * tx.amount, tx.currency, { signed: true })}
    </span>
  );
}

export function CategoryLabel({ category }: { category: Category | undefined }) {
  if (!category) return <span className="text-slate-400">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2 shrink-0 rounded-full" style={{ background: category.color ?? "#8c8a81" }} />
      {category.name}
    </span>
  );
}

export function AccountLabel({ tx, accounts }: { tx: Transaction; accounts: Map<string, Account> }) {
  const from = tx.accountId ? accounts.get(tx.accountId)?.name : undefined;
  if (tx.type === "transfer") {
    const to = tx.destinationAccountId ? accounts.get(tx.destinationAccountId)?.name : undefined;
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        {from ?? "?"} <ArrowLeftRight className="size-3 text-slate-400" /> {to ?? "?"}
      </span>
    );
  }
  return from ? <>{from}</> : <span className="text-slate-400">—</span>;
}

export interface Column {
  key: string;
  label: string;
  align?: "right";
  sortable?: boolean;
}

export function TransactionTable({
  transactions,
  categories,
  accounts,
  onEdit,
  onDuplicate,
  onDelete,
  compact = false,
  header,
}: {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  onEdit?: (tx: Transaction) => void;
  onDuplicate?: (tx: Transaction) => void;
  onDelete?: (tx: Transaction) => void;
  compact?: boolean;
  /** Vlastní hlavička (např. s řazením); jinak se vykreslí jednoduchá. */
  header?: ReactNode;
}) {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const accMap = new Map(accounts.map((a) => [a.id, a]));
  const cell = compact ? "px-5 py-2.5" : "px-4 py-3";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        {header ?? (
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
              <th className={clsx(cell, "font-medium")}>Datum</th>
              <th className={clsx(cell, "font-medium")}>Popis</th>
              <th className={clsx(cell, "font-medium", compact && "max-sm:hidden")}>Kategorie</th>
              {!compact && <th className={clsx(cell, "font-medium")}>Typ</th>}
              <th className={clsx(cell, "text-right font-medium")}>Částka</th>
              {!compact && (
                <>
                  <th className={clsx(cell, "font-medium")}>Účet</th>
                  <th className={clsx(cell, "font-medium")}>Zdroj</th>
                  <th className={cell}>
                    <span className="sr-only">Akce</span>
                  </th>
                </>
              )}
            </tr>
          </thead>
        )}
        <tbody className="divide-y divide-slate-100">
          {transactions.map((tx) => (
            <tr key={tx.id} className="group hover:bg-slate-50/70">
              <td className={clsx(cell, "num whitespace-nowrap text-slate-500")}>{formatDate(tx.date)}</td>
              <td className={clsx(cell, "max-w-64 truncate text-slate-900")}>{tx.description || <span className="text-slate-400">—</span>}</td>
              <td className={clsx(cell, "whitespace-nowrap text-slate-600", compact && "max-sm:hidden")}>
                {tx.type === "transfer" ? <span className="text-slate-400">Převod</span> : <CategoryLabel category={tx.categoryId ? catMap.get(tx.categoryId) : undefined} />}
              </td>
              {!compact && (
                <td className={cell}>
                  <TypeBadge type={tx.type} />
                </td>
              )}
              <td className={clsx(cell, "text-right")}>
                <SignedAmount tx={tx} />
              </td>
              {!compact && (
                <>
                  <td className={clsx(cell, "text-slate-600")}>
                    <AccountLabel tx={tx} accounts={accMap} />
                  </td>
                  <td className={clsx(cell, "text-xs text-slate-500")}>{tx.source === "bank" ? tx.bankProvider ?? "Banka" : "Ruční"}</td>
                  <td className={clsx(cell, "w-0 whitespace-nowrap text-right")}>
                    <div className="flex justify-end gap-0.5 opacity-60 group-hover:opacity-100">
                      {onEdit && (
                        <IconButton label="Upravit" onClick={() => onEdit(tx)}>
                          <Pencil className="size-3.5" />
                        </IconButton>
                      )}
                      {onDuplicate && (
                        <IconButton label="Duplikovat" onClick={() => onDuplicate(tx)}>
                          <Copy className="size-3.5" />
                        </IconButton>
                      )}
                      {onDelete && (
                        <IconButton label="Smazat" onClick={() => onDelete(tx)} className="hover:!bg-expense/10 hover:!text-expense-ink">
                          <Trash2 className="size-3.5" />
                        </IconButton>
                      )}
                    </div>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
