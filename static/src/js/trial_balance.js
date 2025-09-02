/** @odoo-module **/

const { Component } = owl;
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { useRef, useState } from "@odoo/owl";
import { BlockUI } from "@web/core/ui/block_ui";
import { download } from "@web/core/network/download";

const actionRegistry = registry.category("actions");
const luxToday = luxon.DateTime.now();
const monthNamesShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

class TrialBalance extends Component {
    async setup() {
        super.setup(...arguments);
        this.orm = useService("orm");
        this.action = useService("action");

        this.tbody = useRef("tbody");
        this.end_date = useRef("date_to");
        this.start_date = useRef("date_from");
        this.period = useRef("periods");
        this.period_year = useRef("period_year");
        this.unfoldButton = useRef("unfoldButton");

        this.state = useState({
            move_line: null,
            data: null,                     // gate for t-if in template
            total: null,
            journals: [],
            accounts: [],
            selected_analytic: [],
            analytic_account: null,
            selected_journal_list: [],
            selected_analytic_account_rec: [],
            date_range: "month",
            date_type: "month",
            apply_comparison: false,
            comparison_type: null,
            date_viewed: [],
            comparison_number: null,
            options: null,
            method: { accural: true },
        });

        this.load_data();
    }

    async load_data() {
        try {
            // Call your server method which returns (move_line_list, {'journal_ids': [...]})
            const [accounts, meta] = await this.orm.call(
                "account.trial.balance",
                "view_custom_report",
                []
            );

            // Initialize date inputs to current month
            const today = new Date();
            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

            this.start_date.el.value =
                `${startOfMonth.getFullYear()}-${String(startOfMonth.getMonth() + 1).padStart(2, "0")}-${String(startOfMonth.getDate()).padStart(2, "0")}`;
            this.end_date.el.value =
                `${endOfMonth.getFullYear()}-${String(endOfMonth.getMonth() + 1).padStart(2, "0")}-${String(endOfMonth.getDate()).padStart(2, "0")}`;

            this.state.date_viewed = [
                `${monthNamesShort[today.getMonth()]}  ${today.getFullYear()}`
            ];

            // Assign data to state
            this.state.accounts = Array.isArray(accounts) ? accounts : [];
            this.state.journals = (meta && meta.journal_ids) ? meta.journal_ids : [];

            // Flag that data is present so template renders
            this.state.data = true;
        } catch (err) {
            // You can log or surface this if needed
            console.error("Failed to load trial balance data:", err);
        }
    }

    async applyFilter(val, ev, is_delete) {
        if (ev && ev.target && ev.target.attributes["data-value"]
            && ev.target.attributes["data-value"].value === "no comparison") {
            const lastIndex = this.state.date_viewed.length - 1;
            this.state.date_viewed.splice(0, lastIndex);
        }

        if (ev) {
            if (ev.input && ev.input.attributes.placeholder?.value === "Account" && !is_delete) {
                this.state.selected_analytic.push(val[0].id);
                this.state.selected_analytic_account_rec.push(val[0]);
            } else if (is_delete) {
                const index = this.state.selected_analytic_account_rec.indexOf(val);
                if (index >= 0) this.state.selected_analytic_account_rec.splice(index, 1);
                this.state.selected_analytic = this.state.selected_analytic_account_rec.map((rec) => rec.id);
            }
        } else {
            if (val && val.target?.name === "start_date") {
                this.state.date_viewed = [];
                this.state.date_viewed.push("From " + this.formatDate(this.start_date.el.value) + " To " + this.formatDate(this.end_date.el.value));
                this.state.date_range = { ...this.state.date_range, start_date: val.target.value };
            } else if (val && val.target?.name === "end_date") {
                this.state.date_viewed = [];
                this.state.date_viewed.push("From " + this.formatDate(this.start_date.el.value) + "To " + this.formatDate(this.end_date.el.value));
                this.state.date_range = { ...this.state.date_range, end_date: val.target.value };
            } else if (val && val.target?.attributes["data-value"]?.value === "month") {
                this.start_date.el.value = luxToday.startOf("month").toFormat("yyyy-MM-dd");
                this.end_date.el.value = luxToday.endOf("month").toFormat("yyyy-MM-dd");
                this.state.date_viewed = [luxToday.monthShort + " " + luxToday.c.year];
                this.state.date_type = "month";
                this.state.comparison_type = "month";
                this.state.date_range = { start_date: this.start_date.el.value, end_date: this.end_date.el.value };
            } else if (val && val.target?.attributes["data-value"]?.value === "year") {
                this.start_date.el.value = luxToday.startOf("year").toFormat("yyyy-MM-dd");
                this.end_date.el.value = luxToday.endOf("year").toFormat("yyyy-MM-dd");
                this.state.date_viewed = [luxToday.c.year];
                this.state.date_type = "year";
                this.state.comparison_type = "year";
                this.state.date_range = { start_date: this.start_date.el.value, end_date: this.end_date.el.value };
            } else if (val && val.target?.attributes["data-value"]?.value === "quarter") {
                this.start_date.el.value = luxToday.startOf("quarter").toFormat("yyyy-MM-dd");
                this.end_date.el.value = luxToday.endOf("quarter").toFormat("yyyy-MM-dd");
                this.state.date_viewed = ["Q " + luxToday.quarter];
                this.state.comparison_type = this.state.date_type;
                this.state.date_type = "quarter";
                this.state.date_range = { start_date: this.start_date.el.value, end_date: this.end_date.el.value };
            } else if (val && val.target?.attributes["data-value"]?.value === "last-month") {
                this.start_date.el.value = luxToday.startOf("month").minus({ days: 1 }).startOf("month").toFormat("yyyy-MM-dd");
                this.end_date.el.value = luxToday.startOf("month").minus({ days: 1 }).toFormat("yyyy-MM-dd");
                this.state.date_viewed = [luxToday.startOf("month").minus({ days: 1 }).monthShort + " " + luxToday.startOf("month").minus({ days: 1 }).c.year];
                this.state.date_type = "month";
                this.state.comparison_type = "month";
                this.state.date_range = { start_date: this.start_date.el.value, end_date: this.end_date.el.value };
            } else if (val && val.target?.attributes["data-value"]?.value === "last-year") {
                this.start_date.el.value = luxToday.startOf("year").minus({ days: 1 }).startOf("year").toFormat("yyyy-MM-dd");
                this.end_date.el.value = luxToday.startOf("year").minus({ days: 1 }).toFormat("yyyy-MM-dd");
                this.state.date_viewed = [luxToday.startOf("year").minus({ days: 1 }).c.year];
                this.state.date_type = "year";
                this.state.comparison_type = "year";
                this.state.date_range = { start_date: this.start_date.el.value, end_date: this.end_date.el.value };
            } else if (val && val.target?.attributes["data-value"]?.value === "last-quarter") {
                this.start_date.el.value = luxToday.startOf("quarter").minus({ days: 1 }).startOf("quarter").toFormat("yyyy-MM-dd");
                this.end_date.el.value = luxToday.startOf("quarter").minus({ days: 1 }).toFormat("yyyy-MM-dd");
                this.state.date_viewed = ["Q " + luxToday.startOf("quarter").minus({ days: 1 }).quarter];
                this.state.date_type = "quarter";
                this.state.comparison_type = "quarter";
                this.state.date_range = { start_date: this.start_date.el.value, end_date: this.end_date.el.value };
            } else if (val && val.target?.attributes["data-value"]?.value === "journal") {
                const id = parseInt(val.target.attributes["data-id"].value, 10);
                if (!val.target.classList.contains("selected-filter")) {
                    this.state.selected_journal_list.push(id);
                    val.target.classList.add("selected-filter");
                } else {
                    this.state.selected_journal_list = this.state.selected_journal_list.filter((x) => x !== id);
                    val.target.classList.remove("selected-filter");
                }
            } else if (val && val.target?.attributes["data-value"]?.value === "draft") {
                if (val.target.classList.contains("selected-filter")) {
                    const { draft, ...updated } = this.state.options || {};
                    this.state.options = Object.keys(updated).length ? updated : null;
                    val.target.classList.remove("selected-filter");
                } else {
                    this.state.options = { ...(this.state.options || {}), draft: true };
                    val.target.classList.add("selected-filter");
                }
            } else if (val && val.target?.attributes["data-value"]?.value === "cash-basis") {
                if (val.target.classList.contains("selected-filter")) {
                    const { cash, ...updated } = this.state.method || {};
                    this.state.method = Object.keys(updated).length ? updated : {};
                    val.target.classList.remove("selected-filter");
                } else {
                    this.state.method = { ...(this.state.method || {}), cash: true };
                    val.target.classList.add("selected-filter");
                }
            }
        }

        if (this.state.apply_comparison === true) {
            if (this.state.comparison_type === "year") {
                this.state.date_viewed = [];
                let current_year, month;
                if (this.start_date.el.value) {
                    const d = new Date(this.start_date.el.value);
                    current_year = d.getFullYear();
                    month = d.getMonth();
                } else {
                    const d = new Date();
                    current_year = d.getFullYear();
                    month = d.getMonth();
                }
                this.state.comparison_number = this.period_year.el.value;
                for (let i = this.state.comparison_number; i >= 0; i--) {
                    this.state.date_viewed.push(`${monthNamesShort[month]} ${current_year - i}`);
                }
            } else if (this.state.comparison_type === "month" || this.state.comparison_type === "quarter") {
                this.state.date_viewed = [];
                this.state.comparison_number = this.period.el.value;
            }
        }

        // Fetch filtered data (your server method should return the same structure you expect)
        this.state.data = await this.orm.call(
            "account.trial.balance",
            "get_filter_values",
            [
                this.start_date.el.value,
                this.end_date.el.value,
                this.state.comparison_number,
                this.state.comparison_type,
                this.state.selected_journal_list,
                this.state.selected_analytic,
                this.state.options,
                this.state.method,
            ]
        );

        // If get_filter_values returns the same tuple shape, you may want to unpack again:
        // const [accounts, meta] = this.state.data; this.state.accounts = accounts; this.state.journals = meta.journal_ids;
        // Otherwise leave as-is if your template reads state.data directly for the filtered view.
    }

    onPeriodChange(ev) {
        this.period_year.el.value = ev.target.value;
    }

    onPeriodYearChange(ev) {
        this.period.el.value = ev.target.value;
    }

    applyComparisonPeriod(ev) {
        this.state.apply_comparison = true;
        this.state.comparison_type = this.state.date_type;
        this.applyFilter(null, ev);
    }

    applyComparisonYear(ev) {
        this.state.apply_comparison = true;
        this.state.comparison_type = "year";
        this.applyFilter(null, ev);
    }

    sumByKey(data, key) {
        if (!Array.isArray(data)) return 0;
        return data.reduce((acc, item) => {
            let raw = item[key];
            if (typeof raw === "string") raw = raw.replace(/,/g, "");
            const val = parseFloat(raw);
            return acc + (isNaN(val) ? 0 : val);
        }, 0);
    }

    get comparison_number_range() {
        const n = Number(this.state.comparison_number) || 0;
        const range = [];
        for (let i = 1; i <= n; i++) range.push(i);
        return range;
    }

    async applyComparison(ev) {
        this.state.apply_comparison = false;
        this.state.comparison_type = null;
        this.state.comparison_number = null;
        const lastIndex = this.state.date_viewed.length - 1;
        this.state.date_viewed.splice(0, lastIndex);
        this.applyFilter(null, ev);
    }

    getDomain() {
        return [];
    }

    async printPdf(ev) {
        ev.preventDefault();
        const self = this;
        const action_title = self.props.action.display_name;
        let comparison_number_range = self.comparison_number_range;
        let data_viewed = self.state.date_viewed;

        if (self.state.apply_comparison) {
            if (self.comparison_number_range.length > 10) {
                comparison_number_range = self.comparison_number_range.slice(-10);
                data_viewed = self.state.date_viewed.slice(-11);
            }
        }

        return self.action.doAction({
            type: "ir.actions.report",
            report_type: "qweb-pdf",
            report_name: "dynamic_accounts_report.trial_balance",
            report_file: "dynamic_accounts_report.trial_balance",
            data: {
                data: self.state.data,
                date_viewed: data_viewed,
                filters: this.filter(),
                apply_comparison: self.state.apply_comparison,
                comparison_number_range: comparison_number_range,
                title: action_title,
                report_name: self.props.action.display_name,
            },
            display_name: self.props.action.display_name,
        });
    }

    filter() {
        const self = this;
        let startDate, endDate;
        let startYear, startMonth, startDay, endYear, endMonth, endDay;

        if (self.state.date_range) {
            const today = new Date();
            if (self.state.date_range === "year") {
                startDate = new Date(today.getFullYear(), 0, 1);
                endDate = new Date(today.getFullYear(), 11, 31);
            } else if (self.state.date_range === "quarter") {
                const currentQuarter = Math.floor(today.getMonth() / 3);
                startDate = new Date(today.getFullYear(), currentQuarter * 3, 1);
                endDate = new Date(today.getFullYear(), (currentQuarter + 1) * 3, 0);
            } else if (self.state.date_range === "month") {
                startDate = new Date(today.getFullYear(), today.getMonth(), 1);
                endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            } else if (self.state.date_range === "last-month") {
                startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                endDate = new Date(today.getFullYear(), today.getMonth(), 0);
            } else if (self.state.date_range === "last-year") {
                startDate = new Date(today.getFullYear() - 1, 0, 1);
                endDate = new Date(today.getFullYear() - 1, 11, 31);
            } else if (self.state.date_range === "last-quarter") {
                const lastQuarter = Math.floor((today.getMonth() - 3) / 3);
                startDate = new Date(today.getFullYear(), lastQuarter * 3, 1);
                endDate = new Date(today.getFullYear(), (lastQuarter + 1) * 3, 0);
            }

            if (startDate) {
                startYear = startDate.getFullYear();
                startMonth = startDate.getMonth() + 1;
                startDay = startDate.getDate();
            }
            if (endDate) {
                endYear = endDate.getFullYear();
                endMonth = endDate.getMonth() + 1;
                endDay = endDate.getDate();
            }
        }

        const selectedJournalIDs = Object.values(self.state.selected_journal_list || []);
        const selectedJournalNames = selectedJournalIDs.map((journalID) => {
            const journal = self.state.journals[journalID];
            return journal ? journal.name : "";
        });

        const filters = {
            journal: selectedJournalNames,
            account: self.state.selected_analytic_account_rec,
            options: self.state.options,
            comparison_type: self.state.comparison_type,
            comparison_number_range: self.state.comparison_number,
            start_date: null,
            end_date: null,
        };

        if (
            startYear !== undefined &&
            startMonth !== undefined &&
            startDay !== undefined &&
            endYear !== undefined &&
            endMonth !== undefined &&
            endDay !== undefined
        ) {
            filters.start_date = `${startYear}-${startMonth < 10 ? "0" : ""}${startMonth}-${startDay < 10 ? "0" : ""}${startDay}`;
            filters.end_date = `${endYear}-${endMonth < 10 ? "0" : ""}${endMonth}-${endDay < 10 ? "0" : ""}${endDay}`;
        }
        return filters;
    }

    async print_xlsx() {
        const self = this;
        const action_title = self.props.action.display_name;

        const datas = {
            data: self.state.data,
            date_viewed: self.state.date_viewed,
            filters: this.filter(),
            apply_comparison: self.state.apply_comparison,
            comparison_number_range: self.comparison_number_range,
            title: action_title,
            report_name: self.props.action.display_name,
        };

        const action = {
            data: {
                model: "account.trial.balance",
                data: JSON.stringify(datas),
                output_format: "xlsx",
                report_action: self.props.action.xml_id,
                report_name: action_title,
            },
        };

        BlockUI;
        await download({
            url: "/xlsx_report",
            data: action.data,
            complete: () => unblockUI,
            error: (error) => self.call("crash_manager", "rpc_error", error),
        });
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const day = date.getDate().toString().padStart(2, "0");
        const month = (date.getMonth() + 1).toString().padStart(2, "0");
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    }

    gotoJournalItem(ev) {
        return this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "account.move.line",
            name: "Journal Items",
            views: [[false, "list"]],
            domain: [["account_id", "=", parseInt(ev.target.attributes["data-id"].value, 10)]],
            context: { group_by: ["account_id"] },
            target: "current",
        });
    }

    // Bound via t-on-click on the group header row.
    toggleAccountLines(event) {
        const el = event.currentTarget;
        const target = el.getAttribute("data-target"); // e.g., "group-1"
        const rows = document.querySelectorAll("." + target); // rows have class="account-line group-#{i}"
        rows.forEach((tr) => {
            const hidden = (tr.style.display === "none" || tr.style.display === "");
            tr.style.display = hidden ? "table-row" : "none";
        });
    }
}

TrialBalance.template = "custom_trl_b_template_new";
actionRegistry.add("custom_trl_b", TrialBalance);
