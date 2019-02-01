module powerbi.extensibility.visual {

    export class Cluster extends Layer {
        private static readonly ID = 'cluster';
        private static readonly UnclusterID = 'uncluster';
        private static readonly LayerOrder = [Cluster.ID, Cluster.UnclusterID];

        private static readonly LabelID = 'cluster-label'; // cluster label is excluded because it has to be always on top

        private getClusterField: Function;

        constructor(map: MapboxMap, getClusterField) {
            super(map)
            this.id = Cluster.ID
            this.getClusterField = getClusterField
            this.source = data.Sources.Cluster.withGetter(getClusterField)
        }

        getLayerIDs() {
            return [ Cluster.ID, Cluster.LabelID, Cluster.UnclusterID ];
        }

        show(settings) {
            return settings.cluster.show;
        }

        removeLayer() {
            const map = this.parent.getMap();
            Cluster.LayerOrder.forEach((layerId) => map.removeLayer(layerId));
            map.removeLayer(Cluster.LabelID); // label should be removed separately
            map.removeSource('clusterData');
        }

        addLayer(settings, beforeLayerId, roleMap) {
            const map = this.parent.getMap();
            const layers = {};
            layers[Cluster.ID] = mapboxUtils.decorateLayer({
                id: Cluster.ID,
                source: 'clusterData',
                type: 'cluster',
                filter: ['has', 'Count']
            });
            layers[Cluster.UnclusterID] = mapboxUtils.decorateLayer({
                id: Cluster.UnclusterID,
                source: 'clusterData',
                type: 'cluster',
                filter: ['!has', 'Count']
            });
            Cluster.LayerOrder.forEach((layerId) => map.addLayer(layers[layerId], beforeLayerId));

            const clusterLabelLayer = mapboxUtils.decorateLayer({
                id: Cluster.LabelID,
                type: 'symbol',
                source: 'clusterData',
                filter: ["has", "Count"],
                layout: {
                    'text-field': `{${settings.cluster.aggregation}}`,
                    'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
                    'text-size': 12
                },
                paint: {
                    "text-halo-color": "white",
                    "text-halo-width": 1
                }
            });
            map.addLayer(clusterLabelLayer);
        }

        moveLayer(beforeLayerId: string) {
            const map = this.parent.getMap();
            Cluster.LayerOrder.forEach((layerId) => map.moveLayer(layerId, beforeLayerId));
            if (!beforeLayerId) {
                // the cluster label should still be on top when the other layers are moved to top
                map.moveLayer(Cluster.LabelID);
            }
        }

        generateColorStops(settings: MapboxSettings, limits: mapboxUtils.Limits): ColorStops {
            const classCount = mapboxUtils.getClassCount(limits.values)

            if (limits && limits.values && limits.values.length == 1) {
                return []
            }

            const domain = chroma.limits(limits.values, 'e', classCount);
            const colors = chroma.scale([settings.cluster.minColor, settings.cluster.maxColor]).colors(domain.length)
            return domain.map((colorStop, idx) => {
                const color = colors[idx].toString();
                return {colorStop, color};
            });
        }

        applySettings(settings, roleMap) {
            super.applySettings(settings, roleMap);
            const map = this.parent.getMap();
            this.colorStops = []
            if (settings.cluster.show) {
                map.setLayerZoomRange(Cluster.ID, settings.cluster.minZoom, settings.cluster.maxZoom);
                map.setPaintProperty(Cluster.ID, 'circle-stroke-width', settings.cluster.strokeWidth);
                map.setPaintProperty(Cluster.ID, 'circle-stroke-opacity', settings.cluster.strokeOpacity / 100);
                map.setPaintProperty(Cluster.ID, 'circle-stroke-color', settings.cluster.strokeColor);
                map.setPaintProperty(Cluster.ID, 'circle-blur', settings.cluster.blur/100);
                map.setLayerZoomRange(Cluster.LabelID, settings.cluster.minZoom, settings.cluster.maxZoom);
                map.setLayerZoomRange(Cluster.UnclusterID, settings.cluster.minZoom, settings.cluster.maxZoom);
                map.setPaintProperty(Cluster.UnclusterID, 'circle-stroke-width', settings.cluster.strokeWidth);
                map.setPaintProperty(Cluster.UnclusterID, 'circle-stroke-opacity', settings.cluster.strokeOpacity / 100);
                map.setPaintProperty(Cluster.UnclusterID, 'circle-stroke-color', settings.cluster.strokeColor);
                map.setPaintProperty(Cluster.UnclusterID, 'circle-color', settings.cluster.minColor);
                map.setPaintProperty(Cluster.UnclusterID, 'circle-radius', settings.cluster.radius/2);
                const limits = this.source.getLimits()
                if (limits && limits.min && limits.max) {
                    this.colorStops = this.generateColorStops(settings, limits)
                    map.setPaintProperty(Cluster.ID, 'circle-color', [
                        'interpolate', ['linear'], ['get', settings.cluster.aggregation],
                        limits.min, settings.cluster.minColor,
                        limits.max, settings.cluster.maxColor
                    ]);

                    map.setPaintProperty(Cluster.ID, 'circle-radius', [
                        'interpolate', ['linear'], ['get', settings.cluster.aggregation],
                        limits.min, settings.cluster.radius,
                        limits.max, 3 * settings.cluster.radius,
                    ]);

                    map.setLayoutProperty(Cluster.LabelID, 'text-field', `{${settings.cluster.aggregation}}`);
                }
            }
        }

        showLegend(settings: MapboxSettings) {
            return settings.cluster.legend && super.showLegend(settings)
        }

        hasTooltip(tooltips) {
            return true;
        }

        handleTooltip(tooltipEvent: TooltipEventArgs<number>, roleMap, settings) {
            const clusterFields = {
                // clusterFields are defined in the cluster datasources, the field names must match with these.
                Count: true, Sum: true, Minimum: true, Maximum: true, Average: true
            }
            const tooltipData = Layer.getTooltipData(tooltipEvent.data)
                .filter((elem) => (
                    // elem.displayName === this.getClusterField() || // Add cluster variable to the data point
                    roleMap.tooltips[elem.displayName] || // Show these fields on datapoints
                    clusterFields[elem.displayName]       // Show these fields on clusters
                ));

            return tooltipData.map(data => {
                data.value = this.getFormattedTooltipValue(roleMap, data)
                return data;
            })
        }
    }
}
