sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/StandardListItem",
    "sap/m/SelectDialog"
], function(Controller, JSONModel, MessageBox, MessageToast, Filter, FilterOperator, StandardListItem, SelectDialog) {
    "use strict";

    // keep only what Base needs to post
    const _INTENT_PULL_SAMPLES = "PULL_SAMPLES";
    const _INTENT_ABANDON_CONTAINER = "ABANDON_CONTAINER";

    return Controller.extend("com.zc2c.ist.zc2cist.controller.BaseController", {

        /* ==== handy getters ==== */
        getBackend() {
            return this.getOwnerComponent().getModel("istBackend");
        },
        getLocal() {
            return this.getView().getModel("local");
        },

        /* ==== message helpers ==== */
        _isFailureMsg(m) {
            return String(m.MsgTyp || m.MsgType || "").toLowerCase() === "failure";
        },
        _showMessageLog(aMsgs, sTitle, fnOnClose) {
            const text = (aMsgs && aMsgs.length) ?
                aMsgs.map(m => `${m.MsgTyp || m.MsgType || ""}: ${m.Message || ""}`).join("\n") :
                "No messages returned.";
            MessageBox.information(text, {
                title: sTitle,
                onClose: fnOnClose
            });
        },

        /* ==== Samples dialog (reused in Wizard + Process screen) ==== */
        _ensureSamplesDialog() {
            if (!this._pSamplesDialog) {
                this._pSamplesDialog = this.loadFragment({
                    name: "com.zc2c.ist.zc2cist.view.fragments.SampleDialog",
                    controller: this
                });
            }
            return this._pSamplesDialog;
        },

        async _openSamplesDialog(aSamples, oContainer) {
            const oDialog = await this._ensureSamplesDialog();
            const m = new JSONModel({
                Container: {
                    AccountName: oContainer.AccountName || "",
                    Plant: oContainer.Plant,
                    ContainerId: oContainer.ContainerId,
                    ConInsId: oContainer.ConInsId,
                    Status: oContainer.Status || "01",
                    PackageId: oContainer.PackageId || ""
                },
                Samples: aSamples || [],
                SelectedSampleId: "",
                PullComments: "",
                PullCommentsState: "None",
                PullCommentsStateText: "",
                MessageVisible: false,
                MessageText: "",
                MessageType: "Information"
            });
            oDialog.setModel(m, "localSamples");
            oDialog.setTitle(`Samples in ${oContainer.ContainerId}`);
            this.getView().addDependent(oDialog);
            oDialog.open();
        },

        onSelectSample(oEvent) {
            const oItem = oEvent.getParameter("listItem");
            const oCtx = oItem && oItem.getBindingContext("localSamples");
            const oSel = oCtx ? oCtx.getObject() : null;
            const m = this.byId("sampleDialog").getModel("localSamples");
            m.setProperty("/SelectedSampleId", oSel ? oSel.SampleId : "");
        },
        onCloseSamplesMessage() {
            const m = this.byId("sampleDialog").getModel("localSamples");
            m.setProperty("/MessageVisible", false);
        },
        onCloseSampleDialog() {
            if (this._pullMsgTimer) {
                clearTimeout(this._pullMsgTimer);
                this._pullMsgTimer = null;
            }
            if (this._pSamplesDialog) {
                this._pSamplesDialog.then(d => d.close());
            }
        },

        onPullSample() {
            const oDlg = this.byId("sampleDialog");
            const m = oDlg.getModel("localSamples");

            const sSampleId = m.getProperty("/SelectedSampleId");
            if (!sSampleId) {
                m.setProperty("/MessageText", "Please select a sample to pull.");
                m.setProperty("/MessageType", "Warning");
                m.setProperty("/MessageVisible", true);
                return;
            }

            let sComments = (m.getProperty("/PullComments") || "").trim();
            if (!sComments) {
                m.setProperty("/PullCommentsState", "Error");
                m.setProperty("/PullCommentsStateText", "Comments are required to pull a sample.");
                m.setProperty("/MessageText", "Comments are required to pull a sample.");
                m.setProperty("/MessageType", "Error");
                m.setProperty("/MessageVisible", true);
                const oTextArea = this.byId("inpPullComments");
                if (oTextArea && oTextArea.focus) {
                    oTextArea.focus();
                }
                m.refresh();
                return;
            }

            // payload
            const c = m.getProperty("/Container");
            const payload = {
                AccountName: c.AccountName || "",
                Plant: c.Plant,
                ContainerId: c.ContainerId,
                ConInsId: c.ConInsId,
                Status: c.Status || "01",
                PackageId: c.PackageId || "",
                Comments: sComments,
                toContainerItems: [{
                    ContainerId: c.ContainerId,
                    ConInsId: c.ConInsId,
                    SampleId: sSampleId,
                    SamplePull: true,
                    Comments: sComments
                }]
            };

            oDlg.setBusy(true);
            this.getBackend().create("/ContainerHeaderSet", payload, {
                headers: {
                    intent: _INTENT_PULL_SAMPLES
                },
                success: (oData) => {
                    oDlg.setBusy(false);
                    const isSuccess = String(oData.MsgTyp || "").toLowerCase() === "success";
                    const msg = oData.Message || (isSuccess ? "Sample pulled." : "Pull Sample failed.");

                    m.setProperty("/MessageText", msg);
                    m.setProperty("/MessageType", isSuccess ? "Success" : "Error");
                    m.setProperty("/MessageVisible", true);

                    if (isSuccess) {
                        const a = m.getProperty("/Samples") || [];
                        m.setProperty("/Samples", a.filter(s => s.SampleId !== sSampleId));
                        m.setProperty("/SelectedSampleId", "");
                        m.setProperty("/PullComments", "");

                        // Optional refresh hook (Wizard implements _loadContainers)
                        if (typeof this._loadContainers === "function") {
                            this._loadContainers().catch(() => {});
                        }
                    }

                    if (this._pullMsgTimer) clearTimeout(this._pullMsgTimer);
                    this._pullMsgTimer = setTimeout(() => {
                        const d = this.byId("sampleDialog");
                        if (d) {
                            const mm = d.getModel("localSamples");
                            if (mm) mm.setProperty("/MessageVisible", false);
                        }
                    }, 5000);
                },
                error: (e) => {
                    oDlg.setBusy(false);
                    // eslint-disable-next-line no-console
                    console.error(e);
                    m.setProperty("/MessageText", "Pull Sample failed.");
                    m.setProperty("/MessageType", "Error");
                    m.setProperty("/MessageVisible", true);
                }
            });
        },

        /* ==== Packaging Material value help (SelectDialog) ==== */
        _ensurePackMatDialog() {
            if (!this._pPackMatDialog) {
                this._pPackMatDialog = this.loadFragment({
                    name: "com.zc2c.ist.zc2cist.view.fragments.PackMaterialVH",
                    controller: this
                });
            }
            return this._pPackMatDialog;
        },

        _loadPackagingMaterials() {
            return new Promise((resolve, reject) => {
                this.getBackend().read("/PackagingMaterialsSet", {
                    success: (oData) => resolve((oData && oData.results) || []),
                    error: reject
                });
            });
        },

        async onVH_PackageMaterial() {
            try {
                this.getView().setBusy(true);
                const aMaterials = await this._loadPackagingMaterials();
                await this._openPackMatDialog(aMaterials);
            } catch (e) {
                // eslint-disable-next-line no-console
                console.error(e);
                MessageBox.error("Failed to load packaging materials.");
            } finally {
                this.getView().setBusy(false);
            }
        },

        async _openPackMatDialog(aMaterials) {
            const oDialog = await this._ensurePackMatDialog();

            // bind items on the SelectDialog's "items" aggregation (not "content")
            if (!this._oPackItemTemplate) {
                this._oPackItemTemplate = new StandardListItem({
                    title: "{packVH>PackageMaterial}",
                    description: "{packVH>PackageDesc}"
                });
            }

            const oVHModel = new JSONModel({
                Materials: aMaterials || []
            });
            oDialog.setModel(oVHModel, "packVH");
            oDialog.bindAggregation("items", {
                path: "packVH>/Materials",
                template: this._oPackItemTemplate
            });

            this.getView().addDependent(oDialog);
            oDialog.open();
        },

        onPackMatSearch(oEvent) {
            const sQuery = (oEvent.getParameter("value") || "").trim();
            const oBinding = oEvent.getSource().getBinding("items");
            if (!oBinding) return;

            if (!sQuery) {
                oBinding.filter([]);
                return;
            }

            const aFilters = [
                new Filter("PackageMaterial", FilterOperator.Contains, sQuery),
                new Filter("PackageDesc", FilterOperator.Contains, sQuery)
            ];
            oBinding.filter(new Filter({
                filters: aFilters,
                and: false
            }));
        },

        onPackMatConfirm(oEvent) {
            const oItem = oEvent.getParameter("selectedItem");
            if (!oItem) return;
            const oObj = oItem.getBindingContext("packVH").getObject();
            this.getLocal().setProperty("/Process/PackageMaterial", oObj.PackageMaterial || "");
        },

        onPackMatCancel() {
            /* no-op */
        },

        onAbandonSelectedContainersStep2() {
            const aRows = (this.getLocal().getProperty("/Containers") || []).filter(r => r.__selected);

            if (!aRows.length) {
                sap.m.MessageToast.show("Please select at least one container.");
                return;
            }

            sap.m.MessageBox.confirm(
                `Abandon ${aRows.length} selected container(s)?`, {
                    actions: [sap.m.MessageBox.Action.OK, sap.m.MessageBox.Action.CANCEL],
                    emphasizedAction: sap.m.MessageBox.Action.OK,
                    onClose: (act) => {
                        if (act === sap.m.MessageBox.Action.OK) {
                            this._doAbandonSelected(aRows);
                        }
                    }
                }
            );
        },
        _doAbandonSelected(aRows) {
            this.getView().setBusy(true);

            Promise.allSettled(aRows.map(r => this._postAbandonContainer(r, "Abandoned via UI")))
                .then((results) => {
                    this.getView().setBusy(false);

                    const successes = [];
                    const failures = [];

                    results.forEach((res, idx) => {
                        const r = aRows[idx];
                        if (res.status === "fulfilled") {
                            const ent = res.value.d || res.value || {};
                            const typ = String(ent.MsgTyp || "").toLowerCase();
                            const msg = ent.Message || (typ === "success" ? "Abandon succeeded." : "Abandon completed with warnings.");
                            (typ === "success" ? successes : failures).push(`${r.ContainerId} – ${msg}`);
                        } else {
                            failures.push(`${r.ContainerId} – Request failed.`);
                        }
                    });

                    if (successes.length) {
                        // These two come from PP_Wizard and are safe to call from Base when present
                        if (typeof this._loadContainers === "function") this._loadContainers().catch(() => {});
                        if (typeof this._clearContainerSelections === "function") this._clearContainerSelections();
                    }

                    if (successes.length && !failures.length) {
                        sap.m.MessageBox.success(successes.join("\n"), {
                            title: "Abandon Container"
                        });
                    } else if (failures.length && !successes.length) {
                        sap.m.MessageBox.error(failures.join("\n"), {
                            title: "Abandon Container"
                        });
                    } else {
                        const text = [
                            "Succeeded:", ...(successes.length ? successes : ["— none —"]), "",
                            "Failed:", ...(failures.length ? failures : ["— none —"])
                        ].join("\n");
                        sap.m.MessageBox.warning(text, {
                            title: "Abandon Container (Partial)"
                        });
                    }
                })
                .catch((e) => {
                    this.getView().setBusy(false);
                    // eslint-disable-next-line no-console
                    console.error(e);
                    sap.m.MessageBox.error("Abandon Container failed.");
                });
        },
        /**
         * POST ABANDON for a single container row.
         * @param {object} row - container row from /local>/Containers
         * @param {string} sComments - optional comments
         * @returns {Promise<object>} response entity
         */
        _postAbandonContainer(row, sComments) {
            const payload = {
                AccountName: row.AccountName || "",
                Plant: row.Plant,
                ContainerId: row.ContainerId,
                ConInsId: row.ConInsId,
                Comments: sComments || "Abandoned via UI",
                toContainerItems: [{
                    Plant: row.Plant,
                    ContainerId: row.ContainerId,
                    ConInsId: row.ConInsId,
                    Comments: ""
                }]
            };

            return new Promise((resolve, reject) => {
                this.getBackend().create("/ContainerHeaderSet", payload, {
                    headers: {
                        intent: _INTENT_ABANDON_CONTAINER
                    },
                    success: resolve,
                    error: reject
                });
            });
        },

        /**
         * Safe, convenient i18n access from controllers.
         * @param {string} sKey   i18n key
         * @param {any[]} [aArgs] optional substitution args
         * @returns {string}
         */
        getText: function(sKey, aArgs) {
            try {
                var oBundle = this.getOwnerComponent().getModel("i18n").getResourceBundle();
                return oBundle.getText(sKey, aArgs);
            } catch (e) {
                // Fallback to the key so UI never breaks if i18n/model is missing
                return sKey;
            }
        },

        /**
         * Wrap a Promise with a control busy indicator.
         * @param {sap.ui.core.Control|string} vControl control instance or its view ID
         * @param {Promise|Function} vTask a Promise or a function returning a Promise
         * @returns {Promise}
         */
        withBusy: function(vControl, vTask) {
            var oCtrl = typeof vControl === "string" ? this.byId(vControl) : vControl;
            var p = (typeof vTask === "function") ? Promise.resolve().then(vTask) : Promise.resolve(vTask);

            if (!oCtrl || typeof oCtrl.setBusy !== "function") {
                // No-op if control not found; still return the original promise
                return p;
            }

            oCtrl.setBusy(true);
            return p.finally(function() {
                try {
                    oCtrl.setBusy(false);
                } catch (e) {
                    /* ignore */
                }
            });
        }

    });
});