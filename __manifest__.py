{
    "name": "Odoo18 Custom Dynamic Accounting Reports",
    "version": "1.0.0",
    "category": "Accounting/Accounting & Finance",
    "license": "LGPL-3",
    "depends": [
        "account",
        "dynamic_accounts_report",
        "web",
    ],
    "data": [
        "security/ir.model.access.csv",
        "views/custom_accounting_report_views.xml",
    ],
    "assets": {
        "web.assets_backend": [
            # QWeb templates (backend)
            "custom_dynamic_accounts_report/static/src/xml/trial_balance.xml",
            "custom_dynamic_accounts_report/static/src/xml/profit_and_loss.xml",
            # JS
            "custom_dynamic_accounts_report/static/src/js/trial_balance.js",
            "custom_dynamic_accounts_report/static/src/js/profit_and_loss.js",
        ],
    },
    "installable": True,
    "auto_install": False,
    "application": False,
}
