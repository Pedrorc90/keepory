package com.keepory.metadata;

import com.keepory.item.ItemType;
import com.keepory.metadata.dto.MetadataDetail;
import com.keepory.metadata.dto.MetadataSearchResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/metadata")
public class MetadataController {

    private final MetadataService service;

    public MetadataController(MetadataService service) {
        this.service = service;
    }

    @GetMapping("/search")
    public List<MetadataSearchResult> search(@RequestParam ItemType type, @RequestParam String q) {
        return service.search(type, q);
    }

    @GetMapping("/detail")
    public MetadataDetail detail(@RequestParam ItemType type, @RequestParam String externalId) {
        return service.detail(type, externalId);
    }
}
