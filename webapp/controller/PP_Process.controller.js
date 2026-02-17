sap.ui.define([
    "com/zc2c/ist/zc2cist/controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function(BaseController, JSONModel, MessageBox, MessageToast) {
    "use strict";

    const INTENT = Object.freeze({
        PROCESS_PACKAGING_PROPOSAL: "PROCESS_PACKAGING_PROPOSAL"
    });

    return BaseController.extend("com.zc2c.ist.zc2cist.controller.PP_Process", {

        onInit: function() {
            this.oRouter = this.getOwnerComponent().getRouter();
            this.mainModel = this.getOwnerComponent().getModel();
            this.istBackend = this.getOwnerComponent().getModel("istBackend");

            this.oLocal = new JSONModel({
                Header: {
                    PackageId: "",
                    Plant: "",
                    PlantName: "",
                    PlantDisplay: ""
                },
                Process: {
                    WeightGross: "0.000",
                    WeightDryIce: "0.000",
                    WeightUnits: "LB",
                    PackageMaterial: "",
                    Comments: ""
                },
                ProposalItems: [],
                CanGetSamples: false,
                SelectedItem: null
            });
            this.getView().setModel(this.oLocal, "local");

            this.getOwnerComponent().getRouter()
                .getRoute("PP_Process")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        onNavBack() {
            this.oRouter.navTo("RoutePP_List");
        },

        _onRouteMatched(oEvt) {
            const args = oEvt.getParameter("arguments") || {};
            const pkgId = decodeURIComponent(args.PackageId || "");
            const plant = decodeURIComponent(args.Plant || "");

            // seed header
            this.oLocal.setProperty("/Header/PackageId", pkgId);
            this.oLocal.setProperty("/Header/Plant", plant);

            if (pkgId && plant) {
                // Read from RAP to get PlantName (and any other display fields)
                this.mainModel.read(`/PackagingProposal(PackageId='${pkgId}',Plant='${plant}')`, {
                    success: (d) => {
                        const name = d.PlantName || "";
                        this.oLocal.setProperty("/Header/PlantName", name);
                        this.oLocal.setProperty("/Header/PlantDisplay",
                            plant + (name ? " – " + name : "")
                        );
                    }
                });
            }

            // (optional) load assigned containers for the table from the SEGW model
            this._refreshItems(pkgId);

            this._loadHeaderAndItems(pkgId, plant).catch(() => {
                /* errors handled inside */
            });
        },

        _buildPkgKey(pkgId, plant) {
            // Some backends key by PackageId only; others by (PackageId, Plant).
            // Try the 2-key first if plant is provided; fall back to 1-key on 404.
            return plant ? `PackageId='${pkgId}',Plant='${plant}'` : `PackageId='${pkgId}'`;
        },

        _refreshItems: function(pkgId) {
            if (!pkgId) return;
            const path = `/PackagingProposalHeaderSet(PackageId='${pkgId}')/toPackagingProposalItem`;
            this.istBackend.read(path, {
                success: (oData) => {
                    const items = (oData.results || []).map(i => ({
                        ContainerId: i.ContainerId,
                        ConInsId: i.ConInsId
                    }));
                    this.oLocal.setProperty("/ProposalItems", items);
                }
            });
        },
        _loadHeaderAndItems(pkgId, plant) {
            if (!pkgId) return Promise.resolve();

            const tryRead = (key) => new Promise((resolve, reject) => {
                const sKeyPath = `/PackagingProposalHeaderSet(${key})`;

                // Read header (prefill form if backend sends values)
                this.getView().setBusy(true);
                this.istBackend.read(sKeyPath, {
                    success: (h) => {
                        // Prefill (optional – keep if your backend returns these)
                        if (h) {
                            this.oLocal.setProperty("/Process/WeightGross", h.WeightGross || this.oLocal.getProperty("/Process/WeightGross"));
                            this.oLocal.setProperty("/Process/WeightDryIce", h.WeightDryIce || this.oLocal.getProperty("/Process/WeightDryIce"));
                            this.oLocal.setProperty("/Process/WeightUnits", h.WeightUnits || this.oLocal.getProperty("/Process/WeightUnits"));
                            this.oLocal.setProperty("/Process/PackageMaterial", h.PackageMaterial || this.oLocal.getProperty("/Process/PackageMaterial"));
                            this.oLocal.setProperty("/Process/Comments", h.Comments || this.oLocal.getProperty("/Process/Comments"));
                        }

                        // Read items
                        this.istBackend.read(`${sKeyPath}/toPackagingProposalItem`, {
                            success: (d) => {
                                const items = (d.results || []).map(i => ({
                                    ContainerId: i.ContainerId,
                                    ConInsId: i.ConInsId
                                }));
                                this.oLocal.setProperty("/ProposalItems", items);
                                this.oLocal.setProperty("/SelectedItem", null);
                                this.oLocal.setProperty("/CanGetSamples", false);
                                this.getView().setBusy(false);
                                resolve();
                            },
                            error: (e2) => {
                                this.getView().setBusy(false);
                                reject(e2);
                            }
                        });
                    },
                    error: (e1) => {
                        this.getView().setBusy(false);
                        reject(e1);
                    }
                });
            });

            const key2 = this._buildPkgKey(pkgId, plant);
            return tryRead(key2).catch(err => {
                // If 2-key failed (e.g., Plant not a key), fall back to PackageId only.
                if (plant) {
                    const key1 = this._buildPkgKey(pkgId, "");
                    return tryRead(key1);
                }
                throw err;
            });
        },

        onSelectProposalItem: function(oEvent) {
            const aCtxs = oEvent.getSource().getSelectedContexts("local");
            if (aCtxs.length === 1) {
                this.oLocal.setProperty("/SelectedProposalItem", aCtxs[0].getObject());
                this.oLocal.setProperty("/CanGetSamples", true);
            } else {
                this.oLocal.setProperty("/SelectedProposalItem", null);
                this.oLocal.setProperty("/CanGetSamples", false);
            }
        },

        onGetSamplesFromProposal: function() {
            const oSel = this.oLocal.getProperty("/SelectedProposalItem");
            const sPlant = this.oLocal.getProperty("/Plant");
            if (!oSel) {
                MessageToast.show("Please select a proposal item.");
                return;
            }
            if (!sPlant) {
                MessageBox.warning("Plant is missing on header.");
                return;
            }

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
                    // Uses BaseController helper (SampleDialog fragment)
                    this._openSamplesDialog(aSamples, {
                        AccountName: "",
                        Plant: sPlant,
                        ContainerId: oSel.ContainerId,
                        ConInsId: oSel.ConInsId,
                        Status: "01"
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

        onProcessProposal: function() {
            const sPackageId = this.oLocal.getData().Header.PackageId; //this.oLocal.getProperty("/PackageId");
            const sPlant = this.oLocal.getData().Header.Plant; //this.oLocal.getProperty("/Plant") || "";
            if (!sPackageId) {
                MessageBox.warning("Package ID is missing.");
                return;
            }

            const P = this.oLocal.getProperty("/Process") || {};
            const fGross = parseFloat(P.WeightGross);
            const fDryIce = parseFloat(P.WeightDryIce);
            const fGrossVal = Number.isNaN(fGross) ? 0 : fGross;
            const fDryIceVal = Number.isNaN(fDryIce) ? 0 : fDryIce;
            if (fDryIceVal > fGrossVal) {
                MessageBox.error(this.getText("DRY_ICE_GT_GROSS"));
                return;
            }
            const aItems = (this.oLocal.getProperty("/ProposalItems") || []).map(i => ({
                PackageId: sPackageId,
                ConInsId: i.ConInsId,
                ContainerId: i.ContainerId
            }));

            const payload = {
                PackageId: sPackageId,
                Plant: sPlant,
                WeightGross: P.WeightGross || "0.000",
                WeightDryIce: P.WeightDryIce || "0.000",
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
                    const aMsgs = (oData.toPackagingProposalMessagelog && oData.toPackagingProposalMessagelog.results) ?
                        oData.toPackagingProposalMessagelog.results : [];
                    const hasFailure = aMsgs.some(this._isFailureMsg);

                    // Uses BaseController helper (message popup)
                    this._showMessageLog(aMsgs, "Processing Results", () => {
                        if (!hasFailure) {
                            MessageToast.show(`Packaging proposal ${sPackageId} processed.`);
                            this.oRouter.navTo("RoutePP_List", {}, true);
                        }
                    });
                },
                error: (e) => {
                    this.getView().setBusy(false);
                    // eslint-disable-next-line no-console
                    console.error(e);
                    MessageBox.error("Process Packaging Proposal failed.");
                }
            });
        }

        // NOTE:
        // Value help button in the view calls .onVH_PackageMaterial().
        // That handler is implemented in BaseController so we don't redefine it here.
    });
});
