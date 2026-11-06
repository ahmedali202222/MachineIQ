package com.machineiq;

import com.machineiq.config.MachineIqProperties;
import com.machineiq.rules.RuleThresholds;
import com.machineiq.rules.RulesEngine;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
@ConfigurationPropertiesScan
public class MachineIqApplication {

    public static void main(String[] args) {
        SpringApplication.run(MachineIqApplication.class, args);
    }

    @Bean
    RulesEngine rulesEngine(MachineIqProperties props) {
        var r = props.rules();
        return new RulesEngine(new RuleThresholds(
                r.warnTempC(), r.tempHysteresisC(), r.warnVibrationMmS(), r.vibrationHysteresisMmS(), r.staleAfterSeconds()));
    }
}
