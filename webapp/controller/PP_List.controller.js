sap.ui.define([
    "com/zc2c/ist/zc2cist/controller/BaseController",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/Dialog",
    "sap/m/List",
    "sap/m/StandardListItem",
    "sap/m/Button",
    "sap/m/Column",
    "sap/m/Text",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], (BaseController, MessageToast, MessageBox, Dialog, List, StandardListItem, Button, Column, Text, JSONModel, Filter, FilterOperator) => {
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
            const bEnableShowContainers = false; // feature gated for next cycle
            if (oTable && bEnableShowContainers) {
                this._addShowContainersColumn(oTable);
                this._wireShowContainersCells(oTable);
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
        },

        _addShowContainersColumn: function(oTable) {
            if (this._hasShowContainersColumn) {
                return;
            }
            const oCol = new Column({
                header: new Text({ text: this.getText("containersColumn") })
            });
            oTable.addColumn(oCol);
            this._hasShowContainersColumn = true;
        },

        _wireShowContainersCells: function(oTable) {
            const addCellsToItems = () => {
                const aItems = oTable.getItems() || [];
                let bChanged = false;
                aItems.forEach((oItem) => {
                    if (oItem.data("hasShowContainersCell")) {
                        return;
                    }
                    oItem.addCell(new Button({
                        text: this.getText("showContainers"),
                        type: "Transparent",
                        press: this.onShowContainers.bind(this)
                    }));
                    oItem.data("hasShowContainersCell", true);
                    bChanged = true;
                });
                if (bChanged) {
                    oTable.invalidate();
                }
            };

            addCellsToItems();
            oTable.attachUpdateFinished(addCellsToItems);
        },

        _ensureContainersDialog: function() {
            if (this._oContainersDialog) {
                return;
            }

            this._oContainersModel = new JSONModel({ items: [] });

            const oList = new List({
                items: {
                    path: "containers>/items",
                    template: new StandardListItem({
                        title: "{containers>ContainerId}",
                        description: "{containers>ConInsId}"
                    })
                }
            });

            this._oContainersDialog = new Dialog({
                contentWidth: "26rem",
                contentHeight: "20rem",
                resizable: true,
                draggable: true,
                content: [oList],
                buttons: [
                    new Button({
                        text: this.getText("close"),
                        press: () => this._oContainersDialog.close()
                    })
                ]
            });

            this._oContainersDialog.setModel(this._oContainersModel, "containers");
            this.getView().addDependent(this._oContainersDialog);
        },

        onShowContainers: function(oEvent) {
            const oCtx = oEvent.getSource().getBindingContext();
            if (!oCtx) {
                return;
            }
            const sPackageId = oCtx.getProperty("PackageId");
            const oModel = oCtx.getModel();

            this._ensureContainersDialog();
            this._oContainersDialog.setTitle(this.getText("containersTitle", [sPackageId]));

            this.getView().setBusy(true);
            oModel.read("/PackagingProposalItems", {
                filters: [
                    new Filter("PackageId", FilterOperator.EQ, sPackageId)
                ],
                success: (oData) => {
                    this.getView().setBusy(false);
                    const aItems = (oData && oData.results) ? oData.results : [];
                    this._oContainersModel.setProperty("/items", aItems);
                    this._oContainersDialog.open();
                },
                error: (e) => {
                    this.getView().setBusy(false);
                    // eslint-disable-next-line no-console
                    console.error(e);
                    MessageBox.error(this.getText("containersLoadFailed"));
                }
            });
        }
    });
});
