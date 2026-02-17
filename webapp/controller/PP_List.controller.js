sap.ui.define([
    "com/zc2c/ist/zc2cist/controller/BaseController",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], (BaseController, MessageToast, MessageBox) => {
    "use strict";

    return BaseController.extend("com.zc2c.ist.zc2cist.controller.PP_List", {
        onInit: function() {

        },

        _getRouter() {
            return this.getOwnerComponent().getRouter();
        },
        onSmartInit: function(oEvent) {
            // set selection mode on inner table so users can select a row
            const oSmart = oEvent.getSource();
            const oTable = oSmart.getTable(); // sap.m.Table for tableType="ResponsiveTable"
            if (oTable && oTable.setMode) {
                oTable.setMode("SingleSelectLeft"); // or "MultiSelect" if you prefer
                oTable.attachSelectionChange(this._onRowSelectionChange, this);
            }
            this._setOpenEnabled(false);
        },

        _setOpenEnabled(b) {
            const oBtn = this.byId("btnOpen");
            if (oBtn) {
                oBtn.setEnabled(!!b);
            }
        },

        _getSelectedObject() {
            const oSmart = this.byId("stbl");
            const oInner = oSmart && oSmart.getTable();
            const aSel = oInner ? oInner.getSelectedContexts() : [];
            return aSel.length ? aSel[0].getObject() : null;
        },

        _onRowSelectionChange() {
            const oObj = this._getSelectedObject();
            const canOpen = !!oObj && String(oObj.Status) === "01"; // only Created
            this._setOpenEnabled(canOpen);
        },

        onCreateProposal() {
            this._getRouter().navTo("PP_Wizard"); // go to wizard
        },

        onProcessProposal() {
            const oObj = this._getSelectedObject();
            if (!oObj) {
                MessageToast.show("Please select a proposal.");
                return;
            }
            if (String(oObj.Status) !== "01") {
                MessageBox.warning("Only proposals in status 01 (Created) can be opened.");
                return;
            }
            // Pass both keys
            this._getRouter().navTo("PP_Process", {
                PackageId: encodeURIComponent(oObj.PackageId),
                Plant: encodeURIComponent(oObj.Plant)
            });
        }
    });
});