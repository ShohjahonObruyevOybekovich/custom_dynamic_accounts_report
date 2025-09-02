from odoo import api, fields, models
from odoo.tools.date_utils import get_month


class AccountTrialBalance(models.TransientModel):
    """For creating Trial Balance report"""
    _inherit = 'account.trial.balance'
    _description = 'Trial Balance Report'

    @api.model
    def view_custom_report(self):
        """
        Build grouped Trial Balance:
          - Per account: initial totals, period totals, end balance
          - Per group: aggregates of the above
        Returns: (grouped_rows, {'journal_ids': [...]})
        """
        # account types with normal debit balance
        debit_account_types = {
            'asset_receivable', 'asset_cash', 'asset_current', 'asset_non_current',
            'asset_prepayments', 'asset_fixed', 'expense', 'expense_depreciation',
            'expense_direct_cost'
        }

        account_ids = self.env['account.account'].search([
            # ('deprecated', '=', False)
        ])

        today = fields.Date.today()
        period_start, period_end = get_month(today)

        account_group_totals = {}

        for account_id in account_ids:
            # initial balances (< period_start)
            initial_move_line_ids = self.env['account.move.line'].search([
                ('date', '<', period_start),
                ('account_id', '=', account_id.id),
                ('parent_state', '=', 'posted'),
            ])
            initial_total_debit = sum(initial_move_line_ids.mapped('debit'))
            initial_total_credit = sum(initial_move_line_ids.mapped('credit'))

            # movements within period
            move_line_ids = self.env['account.move.line'].search([
                ('date', '>=', period_start),
                ('date', '<=', period_end),
                ('account_id', '=', account_id.id),
                ('parent_state', '=', 'posted'),
            ])
            period_debit = sum(move_line_ids.mapped('debit'))
            period_credit = sum(move_line_ids.mapped('credit'))

            # ending balance
            total_debit = initial_total_debit + period_debit
            total_credit = initial_total_credit + period_credit
            balance = total_debit - total_credit

            # ending DR/CR split
            account_type = account_id.account_type
            if account_type in debit_account_types:
                if balance >= 0:
                    end_total_debit = balance
                    end_total_credit = 0.0
                else:
                    end_total_debit = 0.0
                    end_total_credit = abs(balance)
            else:
                if balance <= 0:
                    end_total_debit = 0.0
                    end_total_credit = abs(balance)
                else:
                    end_total_debit = balance
                    end_total_credit = 0.0

            # skip dead/zero accounts
            if (initial_total_debit == 0 and initial_total_credit == 0 and
                period_debit == 0 and period_credit == 0):
                continue

            # per-account payload (both formatted and raw)
            data = {
                'account': account_id.display_name,
                'account_id': account_id.id,
                'account_code': account_id.code,

                'initial_total_debit': f"{initial_total_debit:,.2f}",
                'initial_total_credit': f"{initial_total_credit:,.2f}",

                # >>> period columns (used by the template)
                'period_debit': f"{period_debit:,.2f}",
                'period_credit': f"{period_credit:,.2f}",

                'end_total_debit': f"{end_total_debit:,.2f}",
                'end_total_credit': f"{end_total_credit:,.2f}",

                # raw values for aggregation
                'raw_initial_debit': initial_total_debit,
                'raw_initial_credit': initial_total_credit,
                'raw_period_debit': period_debit,
                'raw_period_credit': period_credit,
                'raw_end_debit': end_total_debit,
                'raw_end_credit': end_total_credit,
            }

            group = account_id.group_id
            if group:
                group_key = group.id
                group_name = group.name
            else:
                group_key = "ungrouped"
                group_name = "Ungrouped"

            if group_key not in account_group_totals:
                account_group_totals[group_key] = {
                    'account_type': group_key,
                    'account_type_name': group_name,
                    'accounts': [],
                    'initial_total_debit': 0.0,
                    'initial_total_credit': 0.0,

                    # >>> period totals per group (used by the template)
                    'period_total_debit': 0.0,
                    'period_total_credit': 0.0,

                    'end_total_debit': 0.0,
                    'end_total_credit': 0.0,
                }

            grp = account_group_totals[group_key]
            grp['accounts'].append(data)

            # aggregate with raw values
            grp['initial_total_debit'] += initial_total_debit
            grp['initial_total_credit'] += initial_total_credit
            grp['period_total_debit'] += period_debit
            grp['period_total_credit'] += period_credit
            grp['end_total_debit'] += end_total_debit
            grp['end_total_credit'] += end_total_credit

        # format group totals
        for grp in account_group_totals.values():
            grp['initial_total_debit'] = f"{grp['initial_total_debit']:,.2f}"
            grp['initial_total_credit'] = f"{grp['initial_total_credit']:,.2f}"
            grp['period_total_debit'] = f"{grp['period_total_debit']:,.2f}"
            grp['period_total_credit'] = f"{grp['period_total_credit']:,.2f}"
            grp['end_total_debit'] = f"{grp['end_total_debit']:,.2f}"
            grp['end_total_credit'] = f"{grp['end_total_credit']:,.2f}"

        move_line_list = list(account_group_totals.values())
        move_line_list.sort(key=lambda x: x['account_type_name'])

        journal = {
            'journal_ids': self.env['account.journal'].search_read([], ['name'])
        }
        return move_line_list, journal
