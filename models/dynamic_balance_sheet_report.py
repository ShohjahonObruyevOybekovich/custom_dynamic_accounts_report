from odoo import api, fields, models, _
from odoo.tools.date_utils import get_month


class ProfitLossReport(models.TransientModel):
    """For creating Profit and Loss and Balance sheet report."""
    _inherit = 'dynamic.balance.sheet.report'

    @api.model
    def custom_view_report(self, wizard_id=None,):
        """
        Generates a trial balance report for multiple accounts.
        Retrieves account information and calculates total debit and credit
        amounts for each account within the specified date range. Returns a list
        of dictionaries containing account details and transaction totals.
        Groups accounts by account.group_id and then by account.group.name.

        :return: List of dictionaries representing the trial balance report.
        :rtype: list
        """
        
        # Define account types with normal debit balance (logic remains unchanged)
        
        wiz = None
        if wizard_id:
            wiz = self.browse(wizard_id)
        elif self.ids:             # called on a recordset (e.g., browse(wizard_id).method())
            wiz = self
        else:
            wiz = self   
        
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
        
        move_line_list = []
        account_group_totals = {}  # Track totals by account group and group name
        
        for account_id in account_ids:
            # Get initial balances (before period)
            initial_move_line_ids = self.env['account.move.line'].search([
                ('date', '<', period_start),
                ('account_id', '=', account_id.id),
                ('parent_state', '=', 'posted')
            ])
            initial_total_debit = sum(initial_move_line_ids.mapped('debit'))
            initial_total_credit = sum(initial_move_line_ids.mapped('credit'))
            
            # Get period movements
            move_line_ids = self.env['account.move.line'].search([
                ('date', '>=', period_start),
                ('date', '<=', period_end),
                ('account_id', '=', account_id.id),
                ('parent_state', '=', 'posted')
            ])
            period_debit = sum(move_line_ids.mapped('debit'))
            period_credit = sum(move_line_ids.mapped('credit'))
            
            # Calculate ending balance
            total_debit = initial_total_debit + period_debit
            total_credit = initial_total_credit + period_credit
            balance = total_debit - total_credit
            
            # Determine ending debit/credit based on account type and balance (logic unchanged)
            account_type = account_id.account_type
            if account_type in debit_account_types:
                # Normal debit balance accounts
                if balance >= 0:
                    end_total_debit = balance
                    end_total_credit = 0.0
                else:
                    end_total_debit = 0.0
                    end_total_credit = abs(balance)
            else:
                # Normal credit balance accounts (liability, equity, income)
                if balance <= 0:
                    end_total_debit = 0.0
                    end_total_credit = abs(balance)
                else:
                    end_total_debit = balance
                    end_total_credit = 0.0
            
            # Skip accounts with no activity and zero balance
            if (initial_total_debit == 0 and initial_total_credit == 0 and 
                period_debit == 0 and period_credit == 0):
                continue
                
            data = {
                'account': account_id.display_name,
                'account_id': account_id.id,
                'account_code': account_id.code,
                'initial_total_debit': "{:,.2f}".format(initial_total_debit),
                'initial_total_credit': "{:,.2f}".format(initial_total_credit),
                'period_debit': "{:,.2f}".format(period_debit),
                'period_credit': "{:,.2f}".format(period_credit),
                'end_total_debit': "{:,.2f}".format(end_total_debit),
                'end_total_credit': "{:,.2f}".format(end_total_credit),
                # Store raw values for aggregation
                'raw_initial_debit': initial_total_debit,
                'raw_initial_credit': initial_total_credit,
                'raw_period_debit': period_debit,
                'raw_period_credit': period_credit,
                'raw_end_debit': end_total_debit,
                'raw_end_credit': end_total_credit,
            }
            
            # Group by account group ID only
            group_id = account_id.group_id
            if group_id:
                group_key = group_id.id
                group_name = group_id.name
            else:
                group_key = "ungrouped"
                group_name = "Ungrouped"
            
            if group_key not in account_group_totals:
                account_group_totals[group_key] = {
                    'account_type': group_key,  # Keep same key name for compatibility
                    'account_type_name': group_name,  # Use group name
                    'accounts': [],
                    'initial_total_debit': 0.0,
                    'initial_total_credit': 0.0,
                    'period_total_debit': 0.0,
                    'period_total_credit': 0.0,
                    'end_total_debit': 0.0,
                    'end_total_credit': 0.0
                }
            
            # Add account to the group
            account_group_totals[group_key]['accounts'].append(data)
            
            # Aggregate totals using raw values
            account_group_totals[group_key]['initial_total_debit'] += initial_total_debit
            account_group_totals[group_key]['initial_total_credit'] += initial_total_credit
            account_group_totals[group_key]['period_total_debit'] += period_debit
            account_group_totals[group_key]['period_total_credit'] += period_credit
            account_group_totals[group_key]['end_total_debit'] += end_total_debit
            account_group_totals[group_key]['end_total_credit'] += end_total_credit
        
        # Format the aggregated totals
        for account_group_data in account_group_totals.values():
            account_group_data['initial_total_debit'] = "{:,.2f}".format(
                account_group_data['initial_total_debit'])
            account_group_data['initial_total_credit'] = "{:,.2f}".format(
                account_group_data['initial_total_credit'])
            account_group_data['period_total_debit'] = "{:,.2f}".format(
                account_group_data['period_total_debit'])
            account_group_data['period_total_credit'] = "{:,.2f}".format(
                account_group_data['period_total_credit'])
            account_group_data['end_total_debit'] = "{:,.2f}".format(
                account_group_data['end_total_debit'])
            account_group_data['end_total_credit'] = "{:,.2f}".format(
                account_group_data['end_total_credit'])
        
        move_line_list = list(account_group_totals.values())
        move_line_list.sort(key=lambda x: x['account_type_name'])

        return move_line_list