sap.ui.define([
    "com/zc2c/ist/zc2cist/controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], (BaseController, JSONModel, MessageBox, MessageToast, Filter, FilterOperator) => {
    "use strict";

    const INTENT = Object.freeze({
        CREATE_PACKAGING_PROPOSAL: "CREATE_PACKAGING_PROPOSAL",
        ADD_CONTAINER: "ADD_CONTAINER",
        UNASSIGN_CONTAINER: "UNASSIGN_CONTAINER",
        ABANDON_CONTAINER: "ABANDON_CONTAINER",
        PROCESS_PACKAGING_PROPOSAL: "PROCESS_PACKAGING_PROPOSAL",
        PULL_SAMPLES: "PULL_SAMPLES"
    });

    return BaseController.extend("com.zc2c.ist.zc2cist.controller.PP_Wizard", {

        onInit: function() {
            this.oRouter = this.getOwnerComponent().getRouter();
            this.istBackend = this.getOwnerComponent().getModel("istBackend"); // SEGW V2

            this.oLocal = new JSONModel({
                Plant: "",
                PlantName: "",
                SelectedPlant: "",
                Containers: [],
                SelectedContainerCount: 0,
                CanOpenSamples: false,
                CanCreateProposal: false,
                PackageId: "",
                ProposalItems: [],
                SelectedProposalCount: 0,
                CanGetSamplesStep3: false,
                SelectedProposalItem: null,
                AccountNames: [], // [{Key:"", Name:"All Accounts"}, ...]
                SelectedAccount: "", // "" means All
                Process: {
                    WeightGross: "0.000",
                    WeightDryIce: "0.000",
                    WeightUnits: "LB",
                    PackageMaterial: "",
                    Comments: ""
                }
            });
            this.getView().setModel(this.oLocal, "local");

            this.oRouter.getRoute("PP_Wizard").attachPatternMatched(this._onRouteMatched, this);
        },

        onGoToOpenProposals: function() {
            // replace current history entry so Back doesn't bounce you back here
            this.getOwnerComponent().getRouter().navTo("RoutePP_List", {}, true);
        },

        /* --------------------- route init --------------------- */
        _onRouteMatched: function() {
            this.getView().setBusy(true);

            Promise.all([this._loadPlantsPromise(), this._loadUserPlantPromise()])
                .then(([aPlants, sUserPlant]) => {
                    this.getView().setModel(new JSONModel(aPlants || []), "plants");

                    let sPlantName = "";
                    if (sUserPlant && Array.isArray(aPlants)) {
                        const m = aPlants.find(p => p.Plant === sUserPlant);
                        sPlantName = m ? m.Plantname : "";
                    }

                    this.oLocal.setProperty("/Plant", sUserPlant || "");
                    this.oLocal.setProperty("/PlantName", sPlantName || "");

                    MessageToast.show(sUserPlant ? `Loaded user plant: ${sUserPlant}` : "No plant assigned. Please select one.");

                    const oWizard = this.byId("wiz");
                    const oStep1 = this.byId("step1");
                    const oStep2 = this.byId("step2");
                    const oStep3 = this.byId("step3");

                    oWizard.discardProgress(oStep1);
                    oWizard.validateStep(oStep1);
                    oWizard.invalidateStep(oStep2);
                    oWizard.invalidateStep(oStep3);

                    const sPlantNow = this.oLocal.getProperty("/Plant");
                    const hasRows = (this.oLocal.getProperty("/Containers") || []).length > 0;
                    if (sPlantNow && !hasRows) {
                        this._loadContainers(); // fire & forget
                    }
                })
                .catch((err) => {
                    // eslint-disable-next-line no-console
                    console.error("Error loading plant data", err);
                    MessageBox.error("Failed to load plant data from backend.");
                })
                .finally(() => this.getView().setBusy(false));
        },

        _loadPlantsPromise: function() {
            return new Promise((resolve, reject) => {
                this.istBackend.read("/PlantDetailsSet", {
                    success: (oData) => resolve(oData ? (oData.results || []) : null),
                    error: reject
                });
            });
        },

        _loadUserPlantPromise: function() {
            return new Promise((resolve) => {
                this.istBackend.read("/PlantUserSet('CURRENT_USER')", {
                    success: (oData) => resolve(oData ? (oData.Plant || "") : ""),
                    error: () => resolve("") // continue even if none
                });
            });
        },

        /* --------------------- nav --------------------- */
        onNavBack() {
            this.getOwnerComponent().getRouter().navTo("RoutePP_List");
        },

        /* --------------------- step 2: load containers --------------------- */
        _loadContainers: function() {
            const sPlant = this.oLocal.getProperty("/Plant");
            if (!sPlant) {
                MessageToast.show("No plant selected.");
                return Promise.reject("No plant selected");
            }

            this.getView().setBusy(true);
            this.oLocal.setProperty("/CanOpenSamples", false);

            return new Promise((resolve, reject) => {
                this.istBackend.read("/ContainerHeaderSet", {
                    filters: [new Filter("Plant", FilterOperator.EQ, sPlant)],
                    success: (oData) => {
                        const rows = (oData.results || []).map(r => ({
                            __selected: false,
                            ...r
                        }));
                        this.oLocal.setProperty("/Containers", rows);
                        this.oLocal.setProperty("/SelectedContainerCount", 0);
                        this._clearContainerSelections();

                        this.oLocal.setProperty("/AccountNames", this._buildAccountList(rows));
                        this.oLocal.setProperty("/SelectedAccount", "");
                        this._applyAccountFilter("");

                        const oWizard = this.byId("wiz");
                        oWizard.validateStep(this.byId("step1"));
                        oWizard.validateStep(this.byId("step2"));

                        this.getView().setBusy(false);
                        resolve(rows);
                    },
                    error: (e) => {
                        this.getView().setBusy(false);
                        // eslint-disable-next-line no-console
                        console.error("Container load failed", e);
                        MessageBox.error(`Failed to load containers for Plant ${sPlant}`);
                        reject(e);
                    }
                });
            });
        },

        _clearContainerSelections: function() {
            const oTable = this.byId("tblContainers");
            if (oTable && oTable.removeSelections) {
                oTable.removeSelections(true);
            }
            const rows = this.oLocal.getProperty("/Containers") || [];
            rows.forEach(r => r.__selected = false);
            this.oLocal.setProperty("/Containers", rows);
            this.oLocal.setProperty("/SelectedContainerCount", 0);
            this.oLocal.setProperty("/CanOpenSamples", false);
        },

        onAccountFilterChange: function(oEvent) {
            const sKey = oEvent.getParameter("selectedItem") ?
                oEvent.getParameter("selectedItem").getKey() :
                this.oLocal.getProperty("/SelectedAccount");

            this.oLocal.setProperty("/SelectedAccount", sKey);
            this._applyAccountFilter(sKey);
            this._clearContainerSelections();
        },

        _applyAccountFilter: function(sKey) {
            const oTable = this.byId("tblContainers");
            const oBinding = oTable && oTable.getBinding("items");
            if (!oBinding) return;

            if (!sKey) {
                oBinding.filter([]);
            } else {
                oBinding.filter([new Filter("AccountName", FilterOperator.EQ, sKey)]);
            }
        },

        onSelectRow(oEvent) {
            const oTable = oEvent.getSource();
            const aCtxs = oTable.getSelectedContexts("local");
            const rows = this.oLocal.getProperty("/Containers");

            rows.forEach(r => r.__selected = false);
            aCtxs.forEach(ctx => ctx.getObject().__selected = true);

            const count = aCtxs.length;
            this.oLocal.setProperty("/SelectedContainerCount", count);
            this.oLocal.setProperty("/CanOpenSamples", rows.length > 0 && count > 0);

            const invalidSelected = rows.filter(r => r.__selected && !this._isReadyForProposal(r));
            this.oLocal.setProperty("/CanCreateProposal", (count > 0) && (invalidSelected.length === 0));
        },

        onGetSamples: function() {
            const sel = this.oLocal.getProperty("/Containers").filter(r => r.__selected);

            if (!sel.length) {
                MessageToast.show("Please select a container first.");
                return;
            }
            if (sel.length > 1) {
                MessageBox.warning("Please select only one container to view samples.");
                return;
            }

            const c = sel[0];
            const key = `Plant='${c.Plant}',ContainerId='${c.ContainerId}',ConInsId='${c.ConInsId}'`;
            const path = `/ContainerHeaderSet(${key})/toContainerItems`;

            this.getView().setBusy(true);
            this.istBackend.read(path, {
                success: (oData) => {
                    this.getView().setBusy(false);
                    const aSamples = oData.results || [];
                    if (!aSamples.length) {
                        MessageToast.show("No samples found for this container.");
                        return;
                    }
                    // uses BaseController helper
                    this._openSamplesDialog(aSamples, c);
                },
                error: (e) => {
                    this.getView().setBusy(false);
                    // eslint-disable-next-line no-console
                    console.error(e);
                    MessageBox.error("Failed to load samples.");
                }
            });
        },

        onGetSamplesFromProposal: function() {
            const oSel = this.oLocal.getProperty("/SelectedProposalItem");
            if (!oSel) {
                MessageToast.show("Please select a proposal item (container) first.");
                return;
            }
            const sPlant = this.oLocal.getProperty("/Plant");
            if (!sPlant) {
                MessageBox.warning("Plant is missing. Please assign/select a plant first.");
                return;
            }
            const sPackageId = this.oLocal.getProperty("/PackageId") || "";
            const key = `Plant='${sPlant}',ContainerId='${oSel.ContainerId}',ConInsId='${oSel.ConInsId}'`;
            const path = `/ContainerHeaderSet(${key})/toContainerItems`;

            this.getView().setBusy(true);
            this.istBackend.read(path, {
                success: (oData) => {
                    this.getView().setBusy(false);
                    const aSamples = (oData && oData.results) || [];
                    if (!aSamples.length) {
                        MessageToast.show("No samples found for this container.");
                        return;
                    }
                    this._openSamplesDialog(aSamples, {
                        AccountName: "",
                        Plant: sPlant,
                        ContainerId: oSel.ContainerId,
                        ConInsId: oSel.ConInsId,
                        Status: "01",
                        PackageId: sPackageId
                    });
                },
                error: (e) => {
                    this.getView().setBusy(false);
                    // eslint-disable-next-line no-console
                    console.error(e);
                    MessageBox.error("Failed to load samples.");
                }
            });
        },

        /* --------------------- step 2 → create proposal --------------------- */
        _isReadyForProposal: function(row) {
            const rec = Number(row.Samplesreceived || 0);
            const total = Number(row.ContainerTotal || 0);
            return rec === total;
        },

        /*onCreateProposal: function() {
            const sel = (this.oLocal.getProperty("/Containers") || []).filter(r => r.__selected);
            const oWizard = this.byId("wiz");
            const oStep1 = this.byId("step1");
            const oStep2 = this.byId("step2");
            const oStep3 = this.byId("step3");

            if (!sel.length) {
                MessageBox.warning("Please select at least one container before creating the Packaging Proposal.", {
                    title: "Validation"
                });
                oWizard.invalidateStep(oStep2);
                oWizard.invalidateStep(oStep3);
                return;
            }

            const notReady = sel.filter(r => !this._isReadyForProposal(r));
            if (notReady.length) {
                const list = notReady.map(c => `${c.ContainerId} (Samples: ${c.Samplesreceived || 0} / Total: ${c.ContainerTotal || 0})`).join("\n");
                MessageBox.error(
                    "You can only create a Packaging Proposal when Samples Received equals Container Total for ALL selected containers.\n\nNot ready:\n" + list, {
                        title: "Validation"
                    }
                );
                oWizard.invalidateStep(oStep2);
                oWizard.invalidateStep(oStep3);
                return;
            }
            oWizard.validateStep(oStep2);

            const sPlant = this.oLocal.getProperty("/Plant") || "";
            if (!sPlant) {
                MessageBox.warning("Please select a Plant.", {
                    title: "Validation"
                });
                oWizard.invalidateStep(oStep2);
                oWizard.invalidateStep(oStep3);
                return;
            }

            const payload = {
                PackageId: "",
                Plant: sPlant,
                WeightGross: "0.000",
                WeightDryIce: "0.000",
                WeightUnits: "",
                Comments: " ",
                PackageMaterial: " ",
                Status: "",
                CreatedBy: "",
                toPackagingProposalItem: sel.map(r => ({
                    PackageId: "",
                    ConInsId: r.ConInsId,
                    ContainerId: r.ContainerId
                })),
                toPackagingProposalMessagelog: []
            };

            this.getView().setBusy(true);
            this.istBackend.create("/PackagingProposalHeaderSet", payload, {
                headers: {
                    intent: INTENT.CREATE_PACKAGING_PROPOSAL
                },
                success: (oData) => {
                    this.getView().setBusy(false);

                    const pkgId = oData.PackageId || "";
                    this.oLocal.setProperty("/PackageId", pkgId);
                    this.oLocal.setProperty(
                        "/ProposalItems",
                        (oData.toPackagingProposalItem && oData.toPackagingProposalItem.results) ?
                        oData.toPackagingProposalItem.results.map(i => ({
                            ContainerId: i.ContainerId,
                            ConInsId: i.ConInsId
                        })) :
                        payload.toPackagingProposalItem.map(i => ({
                            ContainerId: i.ContainerId,
                            ConInsId: i.ConInsId
                        }))
                    );

                    this.oLocal.setProperty("/CanGetSamplesStep3", false);
                    this.oLocal.setProperty("/SelectedProposalItem", null);

                    const aMsgs = (oData.toPackagingProposalMessagelog && oData.toPackagingProposalMessagelog.results) || [];
                    const hasFailure = aMsgs.some(this._isFailureMsg);

                    if (hasFailure) {
                        this._showMessageLog(aMsgs, "Create Proposal Messages");
                        return;
                    }

                    MessageBox.information(`Packaging proposal ${pkgId} created.`, {
                        title: "Create Proposal",
                        onClose: () => {
                            this._loadContainers().then(() => this._clearContainerSelections()).catch(() => {});
                            oWizard.validateStep(oStep1);
                            oWizard.validateStep(oStep2);
                            oWizard.validateStep(oStep3);
                            this._closeStep3IfOpen();
                            this._autoAdvanceToStep3();
                        }
                    });
                },
                error: (e) => {
                    this.getView().setBusy(false);
                    // eslint-disable-next-line no-console
                    console.error(e);
                    MessageBox.error("Create Packaging Proposal failed.");
                }
            });
        },
        */
        onCreateProposal: function() {
            if (!this._validateBeforeCreate()) {
                return; // Validation failure, so stop the flow
            }

            const oPayload = this._buildCreatePayload();
            this._callCreateProposal(oPayload)
                .then((oData) => {
                    this._postCreateNavigation(oData);
                })
                .catch((error) => {
                    this.getView().setBusy(false);
                    console.error(error);
                    MessageBox.error("Create Packaging Proposal failed.");
                });
        },

        /**
         * Validate fields and selections before creating a proposal.
         * @returns {boolean} true if valid, false otherwise
         */
        _validateBeforeCreate: function() {
            const sel = (this.oLocal.getProperty("/Containers") || []).filter(r => r.__selected);
            const oWizard = this.byId("wiz");
            const oStep2 = this.byId("step2");
            const oStep3 = this.byId("step3");

            if (!sel.length) {
                MessageBox.warning("Please select at least one container before creating the Packaging Proposal.", {
                    title: "Validation"
                });
                oWizard.invalidateStep(oStep2);
                oWizard.invalidateStep(oStep3);
                return false;
            }

            const notReady = sel.filter(r => !this._isReadyForProposal(r));
            if (notReady.length) {
                const list = notReady.map(c => `${c.ContainerId} (Samples: ${c.Samplesreceived || 0} / Total: ${c.ContainerTotal || 0})`).join("\n");
                MessageBox.error(
                    "You can only create a Packaging Proposal when Samples Received equals Container Total for ALL selected containers.\n\nNot ready:\n" + list, {
                        title: "Validation"
                    }
                );
                oWizard.invalidateStep(oStep2);
                oWizard.invalidateStep(oStep3);
                return false;
            }

            oWizard.validateStep(oStep2);

            const sPlant = this.oLocal.getProperty("/Plant") || "";
            if (!sPlant) {
                MessageBox.warning("Please select a Plant.", {
                    title: "Validation"
                });
                oWizard.invalidateStep(oStep2);
                oWizard.invalidateStep(oStep3);
                return false;
            }

            return true;
        },

        /**
         * Build the payload to send to the backend for proposal creation.
         * @returns {object} the payload for the create call
         */
        _buildCreatePayload: function() {
            const sel = (this.oLocal.getProperty("/Containers") || []).filter(r => r.__selected);
            const sPlant = this.oLocal.getProperty("/Plant") || "";

            return {
                PackageId: "",
                Plant: sPlant,
                WeightGross: "0.000",
                WeightDryIce: "0.000",
                WeightUnits: "",
                Comments: " ",
                PackageMaterial: " ",
                Status: "",
                CreatedBy: "",
                toPackagingProposalItem: sel.map(r => ({
                    PackageId: "",
                    ConInsId: r.ConInsId,
                    ContainerId: r.ContainerId
                })),
                toPackagingProposalMessagelog: []
            };
        },

        /**
         * Call the backend service to create the proposal.
         * @param {object} oPayload the payload to send
         * @returns {Promise} resolves with the response from backend
         */
        _callCreateProposal: function(oPayload) {
            this.getView().setBusy(true);
            return new Promise((resolve, reject) => {
                this.istBackend.create("/PackagingProposalHeaderSet", oPayload, {
                    headers: {
                        intent: INTENT.CREATE_PACKAGING_PROPOSAL
                    },
                    success: resolve,
                    error: reject
                });
            });
        },

        /**
         * Handle the navigation and UI updates after the proposal is created.
         * @param {object} oData the response data from the backend
         */
        _postCreateNavigation: function(oData) {
            this.getView().setBusy(false);
            const pkgId = oData.PackageId || "";
            this.oLocal.setProperty("/PackageId", pkgId);
            this.oLocal.setProperty(
                "/ProposalItems",
                (oData.toPackagingProposalItem && oData.toPackagingProposalItem.results) ?
                oData.toPackagingProposalItem.results.map(i => ({
                    ContainerId: i.ContainerId,
                    ConInsId: i.ConInsId
                })) : []
            );

            this.oLocal.setProperty("/CanGetSamplesStep3", false);
            this.oLocal.setProperty("/SelectedProposalItem", null);

            const aMsgs = (oData.toPackagingProposalMessagelog && oData.toPackagingProposalMessagelog.results) || [];
            const hasFailure = aMsgs.some(this._isFailureMsg);

            if (hasFailure) {
                this._showMessageLog(aMsgs, "Create Proposal Messages");
                return;
            }

            MessageBox.information(`Packaging proposal ${pkgId} created.`, {
                title: "Create Proposal",
                onClose: () => {
                    this._loadContainers().then(() => this._clearContainerSelections()).catch(() => {});
                    const oWizard = this.byId("wiz");
                    const oStep1 = this.byId("step1");
                    const oStep2 = this.byId("step2");
                    const oStep3 = this.byId("step3");
                    oWizard.validateStep(oStep1);
                    oWizard.validateStep(oStep2);
                    oWizard.validateStep(oStep3);
                    this._closeStep3IfOpen();
                    this._autoAdvanceToStep3();
                }
            });
        },

        _autoAdvanceToStep3: function() {
            const oWizard = this.byId("wiz");
            const oStep2 = this.byId("step2");

            oWizard.validateStep(oStep2);
            sap.ui.getCore().applyChanges();

            setTimeout(() => {
                try {
                    oWizard.nextStep();
                } catch (e) {
                    /* no-op */
                }
            }, 0);
        },

        _closeStep3IfOpen: function() {
            const oWizard = this.byId("wiz");
            const oStep2 = this.byId("step2");
            oWizard.discardProgress(oStep2);
            sap.ui.getCore().applyChanges();
        },

        /* --------------------- step 3: process --------------------- */
        onProcessProposal: function() {
            const sPackageId = this.oLocal.getProperty("/PackageId");
            if (!sPackageId) {
                MessageBox.warning("Package ID is missing.");
                return;
            }

            const sPlant = this.oLocal.getProperty("/Plant") || "";
            const P = this.oLocal.getProperty("/Process") || {};
            const fGross = parseFloat(P.WeightGross);
            const fDryIce = parseFloat(P.WeightDryIce);
            const fGrossVal = Number.isNaN(fGross) ? 0 : fGross;
            const fDryIceVal = Number.isNaN(fDryIce) ? 0 : fDryIce;
            if (fGrossVal <= 0) {
                MessageBox.error(this.getText("GROSS_WEIGHT_REQUIRED"));
                return;
            }
            if (fDryIceVal > fGrossVal) {
                MessageBox.error(this.getText("DRY_ICE_GT_GROSS"));
                return;
            }

            let aItems = (this.oLocal.getProperty("/ProposalItems") || []).map(i => ({
                PackageId: sPackageId,
                ConInsId: i.ConInsId,
                ContainerId: i.ContainerId
            }));
            if (!aItems.length) {
                const sel = (this.oLocal.getProperty("/Containers") || []).filter(r => r.__selected);
                aItems = sel.map(r => ({
                    PackageId: sPackageId,
                    ConInsId: r.ConInsId,
                    ContainerId: r.ContainerId
                }));
            }

            const sDryIce = (P.WeightDryIce == null || String(P.WeightDryIce).trim() === "") ? "0.000" : P.WeightDryIce;
            this.oLocal.setProperty("/Process/WeightDryIce", sDryIce);

            const payload = {
                PackageId: sPackageId,
                Plant: sPlant,
                WeightGross: P.WeightGross || "0.000",
                WeightDryIce: sDryIce,
                WeightUnits: P.WeightUnits || "",
                Comments: (P.Comments === "" || P.Comments == null) ? " " : P.Comments,
                PackageMaterial: P.PackageMaterial || " ",
                Status: "",
                CreatedBy: "",
                toPackagingProposalItem: aItems,
                toPackagingProposalMessagelog: []
            };

            this.getView().setBusy(true);
            this.istBackend.create("/PackagingProposalHeaderSet", payload, {
                headers: {
                    intent: INTENT.PROCESS_PACKAGING_PROPOSAL
                },
                success: (oData) => {
                    this.getView().setBusy(false);
                    const aMsgs = (oData.toPackagingProposalMessagelog && oData.toPackagingProposalMessagelog.results) ? oData.toPackagingProposalMessagelog.results : [];
                    const hasFailure = aMsgs.some(this._isFailureMsg);

                    this._showMessageLog(aMsgs, "Processing Results", () => {
                        if (!hasFailure) this._resetForNextProposal(true);
                    });
                },
                error: (e) => {
                    this.getView().setBusy(false);
                    // eslint-disable-next-line no-console
                    console.error(e);
                    MessageBox.error("Process Packaging Proposal failed.");
                }
            });
        },

        onStepActivate: async function(oEvent) {
            const iIndex = oEvent.getParameter("index");
            const oWizard = this.byId("wiz");
            const oStep2 = this.byId("step2");

            if (iIndex === 3 && !this.oLocal.getProperty("/PackageId")) {
                MessageToast.show(this.getText("CREATE_PKG_PROPOSAL_STEP_2"));
                setTimeout(() => oWizard.goToStep(this.byId("step2")), 0);
                oWizard.discardProgress(oStep2);
                return;
            }

            if (iIndex >= 1) {
                const sPlant = this.oLocal.getProperty("/Plant");
                const hasRows = (this.oLocal.getProperty("/Containers") || []).length > 0;
                if (sPlant && !hasRows) {
                    try {
                        await this._loadContainers();
                    } catch (e) {
                        /* messaged inside */
                    }
                }
            }
        },

        onAssignPlant: function() {
            const sSelected = this.oLocal.getProperty("/SelectedPlant");
            if (!sSelected) {
                MessageToast.show("Please select a plant to assign.");
                return;
            }

            this.getView().setBusy(true);
            const oPayload = {
                Uname: "CURRENT_USER",
                Plant: sSelected,
                Message: "",
                Status: ""
            };

            this.istBackend.create("/PlantUserSet", oPayload, {
                success: (oData) => {
                    this.getView().setBusy(false);
                    const sPlant = oData.Plant || sSelected;
                    this.oLocal.setProperty("/Plant", sPlant);
                    this.oLocal.setProperty("/SelectedPlant", sPlant);
                    MessageToast.show("Plant assigned successfully: " + sPlant);

                    this._resetWizardFromStep2();
                    this._loadContainers();
                },
                error: (oErr) => {
                    this.getView().setBusy(false);
                    // eslint-disable-next-line no-console
                    console.error(oErr);
                    MessageBox.error("Failed to assign plant. Please try again.");
                }
            });
        },

        _resetWizardFromStep2: function() {
            const oWizard = this.byId("wiz");
            const oStep1 = this.byId("step1");

            oWizard.discardProgress(oStep1);

            this.oLocal.setProperty("/Containers", []);
            this.oLocal.setProperty("/SelectedContainerCount", 0);
            this.oLocal.setProperty("/CanOpenSamples", false);
            this.oLocal.setProperty("/PackageId", "");
            this.oLocal.setProperty("/ProposalItems", []);
        },

        _resetForNextProposal: function(bReload) {
            const sPlant = this.oLocal.getProperty("/Plant") || "";
            const sPlantName = this.oLocal.getProperty("/PlantName") || "";

            this.oLocal.setProperty("/Containers", []);
            this.oLocal.setProperty("/SelectedContainerCount", 0);
            this.oLocal.setProperty("/CanOpenSamples", false);
            this.oLocal.setProperty("/AccountNames", []);
            this.oLocal.setProperty("/SelectedAccount", "");

            this.oLocal.setProperty("/PackageId", "");
            this.oLocal.setProperty("/ProposalItems", []);
            this.oLocal.setProperty("/CanGetSamplesStep3", false);
            this.oLocal.setProperty("/SelectedProposalItem", null);
            this.oLocal.setProperty("/Process", {
                WeightGross: "0.000",
                WeightDryIce: "0.000",
                WeightUnits: "",
                PackageMaterial: "",
                Comments: ""
            });

            this.oLocal.setProperty("/Plant", sPlant);
            this.oLocal.setProperty("/PlantName", sPlantName);

            const oWizard = this.byId("wiz");
            const oStep1 = this.byId("step1");
            const oStep2 = this.byId("step2");
            const oStep3 = this.byId("step3");
            oWizard.discardProgress(oStep2);
            oWizard.validateStep(oStep2);
            if (oStep3) {
                oWizard.invalidateStep(oStep3);
            }

            const goToStep2 = () => {
                // make Step 2 the current step
                try {
                    oWizard.goToStep(oStep2);
                } catch (e) {
                    try {
                        oWizard.nextStep();
                    } catch (ignore) {}
                }
            };

            if (bReload) {
                this._loadContainers()
                    .catch(() => {}).finally(() => {
                        // Step 2 becomes valid after containers load
                        oWizard.validateStep(oStep2);
                        setTimeout(goToStep2, 0);
                    });
            } else {
                setTimeout(goToStep2, 0);
            }
        },

        _buildAccountList: function(rows) {
            const names = Array.from(new Set((rows || []).map(r => r.AccountName).filter(Boolean))).sort();
            return [{
                Key: "",
                Name: "All Accounts"
            }].concat(names.map(n => ({
                Key: n,
                Name: n
            })));
        },

        onSelectProposalItem: function(oEvent) {
            const oTable = oEvent.getSource(); // tblProposalItems
            const aCtxs = oTable.getSelectedContexts("local");
            const count = aCtxs.length;

            this.oLocal.setProperty("/SelectedProposalCount", count);
            this.oLocal.setProperty("/CanGetSamplesStep3", count === 1);

            if (count === 1) {
                this.oLocal.setProperty("/SelectedProposalItem", aCtxs[0].getObject());
            } else {
                this.oLocal.setProperty("/SelectedProposalItem", null);
            }
        },

        onAddContainer: function() {
            const payload = {
                PackageId: this.oLocal.getProperty("/PackageId") || "",
                toPackagingProposalItem: [],
                toPackagingProposalMessagelog: []
            };
            this.istBackend.create("/PackagingProposalHeaderSet", payload, {
                headers: {
                    intent: INTENT.ADD_CONTAINER
                },
                success: () => {
                    /* implement when ready */
                },
                error: () => MessageBox.error("Add Container failed.")
            });
        },

        onUnassignContainer: function() {
            const sPackageId = this.oLocal.getProperty("/PackageId");
            const sPlant = this.oLocal.getProperty("/Plant") || "";
            if (!sPackageId) {
                MessageToast.show("Package ID is missing.");
                return;
            }

            const oTable = this.byId("tblProposalItems");
            const aCtxs = oTable ? oTable.getSelectedContexts("local") : [];
            if (!aCtxs.length) {
                MessageToast.show("Please select one or more proposal items.");
                return;
            }

            const aItems = aCtxs.map(c => {
                const o = c.getObject();
                return {
                    PackageId: sPackageId,
                    ConInsId: o.ConInsId,
                    ContainerId: o.ContainerId
                };
            });

            const payload = {
                PackageId: sPackageId,
                Plant: sPlant,
                toPackagingProposalItem: aItems,
                toPackagingProposalMessagelog: []
            };

            this.getView().setBusy(true);
            this.istBackend.create("/PackagingProposalHeaderSet", payload, {
                headers: {
                    intent: INTENT.UNASSIGN_CONTAINER
                },
                success: (oData) => {
                    this.getView().setBusy(false);
                    const d = oData.d || oData || {};
                    const aLog = (d.toPackagingProposalMessagelog && d.toPackagingProposalMessagelog.results) || [];
                    const hasFailure = aLog.some(this._isFailureMsg);

                    this._showMessageLog(aLog, "Unassign Container", () => {
                        if (!hasFailure) this._refreshProposalItems(sPackageId);
                    });
                },
                error: (e) => {
                    this.getView().setBusy(false);
                    // eslint-disable-next-line no-console
                    console.error(e);
                    MessageBox.error("Unassign Container failed.");
                }
            });
        },

        _refreshProposalItems: function(sPackageId) {
            const key = `PackageId='${sPackageId}'`;
            const path = `/PackagingProposalHeaderSet(${key})/toPackagingProposalItem`;

            this.getView().setBusy(true);
            this.istBackend.read(path, {
                success: (oData) => {
                    this.getView().setBusy(false);
                    const a = (oData && oData.results) || [];
                    const items = a.map(i => ({
                        ContainerId: i.ContainerId,
                        ConInsId: i.ConInsId
                    }));

                    this.oLocal.setProperty("/ProposalItems", items);
                    this.oLocal.setProperty("/SelectedProposalCount", 0);
                    this.oLocal.setProperty("/CanGetSamplesStep3", false);

                    const oTbl = this.byId("tblProposalItems");
                    if (oTbl && oTbl.removeSelections) oTbl.removeSelections(true);
                },
                error: (e) => {
                    this.getView().setBusy(false);
                    // eslint-disable-next-line no-console
                    console.error(e);
                    MessageBox.error("Failed to refresh proposal items.");
                }
            });
        }
    });
});
